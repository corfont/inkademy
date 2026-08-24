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
    "taxAffectation" TEXT NOT NULL DEFAULT 'EXONERADO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SunatSettings_pkey" PRIMARY KEY ("id")
);
