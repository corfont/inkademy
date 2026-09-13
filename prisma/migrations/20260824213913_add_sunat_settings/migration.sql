-- CreateTable
CREATE TABLE "SunatSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "env" TEXT NOT NULL DEFAULT 'beta',
    "ruc" TEXT,
    "solUser" TEXT,
    "solPassword" TEXT,
    "razonSocial" TEXT,
    "address" TEXT,
    "ubigeo" TEXT,
    "boletaSeries" TEXT,
    "facturaSeries" TEXT,
    "boletaCreditSeries" TEXT,
    "facturaCreditSeries" TEXT,
    "certPem" TEXT,
    "certKeyPem" TEXT,
    -- Default GRAVADO desde la creación de la tabla (Inkapitales no es
    -- institución educativa exonerada) — antes esto se fijaba con un
    -- ALTER COLUMN aparte en 20260824100000_batch2_multirole_partners_scheduling,
    -- que corre ANTES que esta migración por nombre de carpeta y fallaba
    -- con "relation SunatSettings does not exist" en una base de datos
    -- nueva (mismo bug de orden documentado en esa carpeta).
    "taxAffectation" TEXT NOT NULL DEFAULT 'GRAVADO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SunatSettings_pkey" PRIMARY KEY ("id")
);
