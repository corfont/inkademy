-- Editor de autoría SCORM: la definición editable de diapositivas vive acá;
-- el paquete real (imsmanifest.xml + index.html) se genera a partir de esto
-- y se sube al mismo scormPackagePrefix que ya usa un .zip subido a mano.
ALTER TABLE "Lesson" ADD COLUMN "scormAuthoredContent" JSONB;
