-- =============================================================================
-- CAMARAGE · Agregar un integrante a la banda con su rol
-- -----------------------------------------------------------------------------
-- ANTES de correr esto, el usuario tiene que existir en Supabase Auth. Dos formas:
--   A) Authentication → Users → Invite user   (le llega un mail y ella elige la clave)
--   B) Authentication → Users → Add user      (vos ponés la clave, tildá Auto Confirm)
--
-- Después corré este script. Es idempotente: si ya está, le actualiza el rol.
--
-- Crear el usuario NO alcanza por sí solo: todas las tablas están protegidas por
-- is_band_member(), así que sin la fila en band_members entra y ve la app vacía.
-- Esta es justamente la fila que falta.
--
-- Roles válidos: 'owner', 'singer', 'bassist', 'drummer', 'guitarist', 'keys',
--                'fx', 'other'
-- =============================================================================

-- ↓↓↓ EDITÁ ESTAS TRES LÍNEAS ↓↓↓
do $$
declare
  v_email  text := 'mail-de-la-baterista@ejemplo.com';   -- el mail con el que la creaste
  v_rol    band_role := 'drummer';
  v_nombre text := 'Paloma';                             -- cómo se muestra en la app
  -- ↑↑↑ nada más que editar de acá para abajo ↑↑↑
  v_user  uuid;
  v_band  uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No existe ningún usuario con el mail %. Crealo primero en Authentication → Users.', v_email;
  end if;

  -- La banda: la misma en la que ya estás vos
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
    do update set role = excluded.role,
                  display_name = excluded.display_name,
                  is_active = true;

  raise notice 'Listo: % queda como % en la banda %', v_email, v_rol, v_band;
end $$;

-- =============================================================================
-- VERIFICACIÓN — tienen que aparecer todos los integrantes de la banda
-- =============================================================================
select b.name as banda, u.email, m.role, m.display_name, m.is_active, m.joined_at
  from band_members m
  join auth.users u on u.id = m.user_id
  join bands b      on b.id = m.band_id
 order by m.joined_at;

-- =============================================================================
-- PARA SACARLE EL ACCESO (sin borrar el usuario ni su historial)
-- -----------------------------------------------------------------------------
--   update band_members set is_active = false
--    where user_id = (select id from auth.users where lower(email) = lower('mail@ejemplo.com'));
--
-- is_band_member() exige is_active = true, así que con eso deja de ver todo,
-- pero la fila queda para volver a activarla cuando quieras.
-- =============================================================================
