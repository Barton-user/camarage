-- =============================================================================
-- CAMARAGE · Crear el usuario de Gonzalo por SQL, con contraseña, y meterlo
--            en la banda. Todo en un solo paso.
-- -----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase. Idempotente: si el usuario ya existe no
-- lo duplica, solo le asegura la membresía y el rol.
--
-- ⚠️ Esto escribe directo en auth.users y auth.identities, que son tablas
-- internas de Supabase. Funciona, pero no es la vía oficial: si alguna vez ves
-- comportamiento raro en el login de este usuario, borralo y recrealo desde
-- Authentication → Add user, que hace lo mismo por la API.
--
-- La fila de auth.identities es la parte que se olvida siempre. Sin ella el
-- usuario entra igual, pero después el "olvidé mi contraseña" y el login por
-- código pueden fallar. Por eso va incluida.
-- =============================================================================

do $$
declare
  v_email  text      := 'vecchie.gonzalo@gmail.com';
  v_pass   text      := '1234';
  v_rol    band_role := 'drummer';        -- ← revisá que sea el instrumento correcto
  v_nombre text      := 'Gonzalo';
  v_user   uuid;
  v_band   uuid;
  v_tiene_provider_id boolean;
begin
  -- ------------------------------------------------------------- 1 · usuario --
  select id into v_user from auth.users where lower(email) = lower(v_email);

  if v_user is null then
    v_user := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user, 'authenticated', 'authenticated', lower(v_email),
      crypt(v_pass, gen_salt('bf')),        -- bcrypt, igual que hace Supabase
      now(), null, null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      json_build_object('name', v_nombre)::jsonb,
      now(), now(),
      '', '', '', ''
    );

    -- La identidad. El nombre de las columnas cambió entre versiones de
    -- Supabase, así que averiguo cuál corresponde antes de insertar.
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'identities'
         and column_name = 'provider_id'
    ) into v_tiene_provider_id;

    if v_tiene_provider_id then
      execute format(
        'insert into auth.identities (provider_id, user_id, identity_data, provider,
                                      last_sign_in_at, created_at, updated_at)
         values (%L, %L, %L::jsonb, %L, now(), now(), now())',
        v_user::text, v_user,
        json_build_object('sub', v_user::text, 'email', lower(v_email))::text,
        'email');
    else
      execute format(
        'insert into auth.identities (id, user_id, identity_data, provider,
                                      last_sign_in_at, created_at, updated_at)
         values (%L, %L, %L::jsonb, %L, now(), now(), now())',
        gen_random_uuid(), v_user,
        json_build_object('sub', v_user::text, 'email', lower(v_email))::text,
        'email');
    end if;

    raise notice 'Usuario creado: %  (id %)', v_email, v_user;
  else
    -- Ya existía: solo le pongo la contraseña que pediste
    update auth.users
       set encrypted_password = crypt(v_pass, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user;
    raise notice 'El usuario ya existía, le puse la contraseña nueva: %', v_email;
  end if;

  -- ----------------------------------------------------------- 2 · membresía --
  select band_id into v_band from band_members
   where role = 'owner' order by joined_at limit 1;
  if v_band is null then
    select id into v_band from bands order by created_at limit 1;
  end if;
  if v_band is null then
    raise exception 'No encontré ninguna banda.';
  end if;

  insert into band_members (band_id, user_id, role, display_name, is_active)
  values (v_band, v_user, v_rol, v_nombre, true)
  on conflict (band_id, user_id)
    do update set role         = excluded.role,
                  display_name = excluded.display_name,
                  is_active    = true;

  raise notice 'Listo. % entra con la contraseña "%" y queda como % en la banda.',
               v_email, v_pass, v_rol;
end $$;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
select u.email,
       (u.encrypted_password is not null) as tiene_contrasena,
       (u.email_confirmed_at is not null) as confirmado,
       (select count(*) from auth.identities i where i.user_id = u.id) as identidades,
       m.role, m.display_name, m.is_active
  from auth.users u
  left join band_members m on m.user_id = u.id
 where lower(u.email) = lower('vecchie.gonzalo@gmail.com');
-- Tiene que dar: tiene_contrasena = true, confirmado = true, identidades = 1,
-- role = drummer, is_active = true.

-- =============================================================================
-- SI ALGO SALE MAL Y QUERÉS BORRARLO PARA REHACERLO DESDE EL DASHBOARD
-- -----------------------------------------------------------------------------
--   delete from auth.users where lower(email) = lower('vecchie.gonzalo@gmail.com');
--   (band_members y auth.identities se borran solos por la cascada)
-- =============================================================================
