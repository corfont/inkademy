-- Fórmula de ponderación entre varios exámenes de un mismo curso (p.ej.
-- diplomados con varios exámenes que pesan distinto en la nota final).
ALTER TABLE "Assessment" ADD COLUMN "weightPercent" DOUBLE PRECISION;
ALTER TABLE "ApprovalRule" ADD COLUMN "scoreMode" TEXT NOT NULL DEFAULT 'BEST_ATTEMPT';
