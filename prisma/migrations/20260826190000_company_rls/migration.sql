-- "Multi-tenancy con Postgres RLS" — segunda capa de aislamiento B2B sobre
-- companyId + Guards (que ya son correctos, ver CompaniesService). La
-- política queda "abierta" (permite todo) cuando app.current_company_id no
-- está seteada — eso es lo que hace que el resto de la app (admin, worker,
-- prisma/seed.ts, scripts de verificación) no cambie de comportamiento;
-- solo las rutas /companies/:companyId/* (vía TenantContextInterceptor,
-- ver prisma.module.ts) fijan esa variable y quedan realmente acotadas.
--
-- FORCE ROW LEVEL SECURITY es necesario porque la conexión de la app usa el
-- mismo usuario dueño de las tablas ("inkademy") — sin FORCE, Postgres
-- exime al dueño de RLS por defecto y las políticas no harían nada.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'CompanyMembership',
    'Enrollment',
    'Order',
    'CompanySeatPool',
    'Quote',
    'SupportTicket',
    'NpsSurveyResponse'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
         current_setting(''app.current_company_id'', true) IS NULL
         OR "companyId" = current_setting(''app.current_company_id'', true)
       )',
      tbl
    );
  END LOOP;
END $$;
