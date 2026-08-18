-- =============================================================================
-- CAMARAGE · Alta de vecchie.gonzalo@gmail.com en la banda
-- -----------------------------------------------------------------------------
-- PASO 1 (en el dashboard, antes de correr esto):
--   Authentication → Users → Add user
--     Email: vecchie.gonzalo@gmail.com
--     Password: la que le vayas a pasar
--     ✅ Auto Confirm User      ← tildalo, si no tiene que confirmar por mail
--
-- PASO 2: correr este script en el SQL Editor.
--
-- Crear el usuario NO alcanza: sin la fila de band_members entra y ve la app
-- vacía, porque todo está protegido por is_band_member(). Esto es esa fila.
--
-- ⚠️ REVISÁ EL ROL antes de correr. Lo dejé en 'drummer'. Si Gonzalo toca otra
-- cosa, cambialo. Válidos: 'owner', 'singer', 'bassist', 'drummer',
-- 'guitarist', 'keys', 'fx', 'other'. El script se puede volver a correr
-- cuantas veces quieras: si el rol quedó mal, lo cambiás y lo corrés de nuevo.
-- =============================================================================

do $$
declare
  v_email  text      := 'vecchie.gonzalo@gmail.com';
  v_rol    band_role := 'drummer';        -- ← revisá esto
  v_nombre text      := 'Gonzalo';
  v_user   uuid;
  v_band   uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception
      'Todavía no existe el usuario %. Hacé primero el PASO 1: Authentication → Users → Add user.',
      v_email;
  end if;

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

  raise notice 'Listo: % queda como % en la banda %', v_email, v_rol, v_band;
end $$;

-- Verificación: tienen que aparecer todos los integrantes
select b.name as banda, u.email, m.role, m.display_name, m.is_active
  from band_members m
  join auth.users u on u.id = m.user_id
  join bands b      on b.id = m.band_id
 order by m.joined_at;
