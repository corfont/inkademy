-- "Multi-tenancy con Postgres RLS" — hallazgo real al verificar en vivo:
-- el rol de conexión de la app ("inkademy") es SUPERUSER en este entorno
-- (típico de un Postgres local de docker-compose, un solo dueño para
-- todo). Postgres SIEMPRE exime a los superusuarios de RLS — ni siquiera
-- FORCE ROW LEVEL SECURITY los alcanza (es una regla dura, no hay política
-- que la revierta). Verificado con datos reales: dos empresas de prueba,
-- consultando CompanySeatPool con app.current_company_id fijado a cada una
-- por separado — las dos seguían viéndose siempre, con o sin RLS.
--
-- La solución no es sacarle SUPERUSER a "inkademy" (lo usan migraciones y
-- el resto de la app; tocar eso es un cambio de alcance mucho mayor) sino
-- crear un rol NUEVO, sin privilegios especiales, que solo usa la
-- transacción con contexto de tenant (ver prisma.module.ts) — el resto de
-- la app sigue exactamente igual, conectada como "inkademy".
-- ADVERTENCIA: esta migración queda en el repo (a diferencia de .env, que
-- está en .gitignore), así que la contraseña de abajo NO debe considerarse
-- secreta más allá de este entorno de desarrollo local. Antes de aplicar
-- esto contra cualquier base que no sea localhost (staging/producción),
-- rotarla con `ALTER ROLE inkademy_tenant WITH PASSWORD '...'` (un valor
-- generado aparte, fuera de control de versiones) y actualizar
-- TENANT_DATABASE_URL en el .env de ese entorno para que coincida.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inkademy_tenant') THEN
    CREATE ROLE inkademy_tenant WITH LOGIN PASSWORD 'a0NsP7yiw1J01jP9v9Hgx6B8zoi_cGVV';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO inkademy_tenant;

-- Lectura amplia (para los `include`/joins que ya hacen los reportes de
-- empresa contra Course/User/etc.) — sin política RLS en esas otras
-- tablas, esto no cambia nada respecto a lo que "inkademy" ya podía leer.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO inkademy_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO inkademy_tenant;

-- Escritura SOLO en las tablas con política RLS — es lo único que este rol
-- necesita modificar; todo lo demás queda de solo lectura para él.
GRANT INSERT, UPDATE, DELETE ON
  "CompanyMembership", "Enrollment", "Order", "CompanySeatPool", "Quote", "SupportTicket", "NpsSurveyResponse"
  TO inkademy_tenant;
