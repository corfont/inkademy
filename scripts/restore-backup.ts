// ============================================================================
// Restaura un backup completo (generado por apps/worker/src/lib/backup.ts,
// ver /admin/backups) — deliberadamente un script de línea de comandos, NO
// un botón en el panel admin: cargar un backup completo encima de una base
// de datos viva desde una request HTTP es de las formas más fáciles de
// perder datos por accidente (ambiente equivocado, escrituras concurrentes
// a mitad de restore, sin punto de retorno). Un humano lo corre a mano,
// confirma explícitamente contra qué base va a escribir, y decide qué hacer
// con los binarios de `files/` (certificados/convenios/facturas) — el
// script NO los resube solo.
//
// Uso: pnpm backup:restore <ruta-al-zip-descargado>
//
// Mismo patrón de resolución de módulos que prisma/seed.ts: se ejecuta con
// `tsx` desde la raíz del repo (que no es un paquete del workspace), así
// que `@inkademy/db`/JSZip se importan/resuelven igual que ahí — ver el
// comentario de seed.ts para el detalle completo.
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import dotenv from "dotenv";

dotenv.config({ path: join(__dirname, "../.env") });
if (!existsSync(join(__dirname, "../.env"))) {
  // eslint-disable-next-line no-console
  console.warn("Aviso: no se encontró .env en la raíz del repo; usando solo variables de entorno del proceso.");
}

import JSZip from "jszip";
import { Prisma, prisma } from "../packages/db/src";

function modelAccessor(modelName: string): string {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

/**
 * Orden de inserción seguro (padres antes que hijos) calculado del propio
 * DMMF en vez de mantenido a mano — un modelo con una FK hacia otro
 * (`relationFromFields` no vacío) depende de que el otro ya exista. Mismo
 * criterio de "computar, no hardcodear" que ya usa buildFullBackup().
 */
function topologicalOrder(): string[] {
  const models = Prisma.dmmf.datamodel.models;
  const dependsOn = new Map<string, Set<string>>();
  for (const m of models) dependsOn.set(m.name, new Set());
  for (const m of models) {
    for (const f of m.fields) {
      if (f.relationFromFields && f.relationFromFields.length > 0 && f.type !== m.name) {
        dependsOn.get(m.name)!.add(f.type);
      }
    }
  }

  const ordered: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      // Ciclo entre FKs opcionales (a esta escala de schema, no se esperan,
      // pero por si acaso: se rompe el ciclo insertando este modelo ya, y
      // se avisa — un humano está mirando la salida de este script).
      // eslint-disable-next-line no-console
      console.warn(`Ciclo de dependencias detectado en ${name}, se inserta en el orden que aparece en el schema.`);
      return;
    }
    visiting.add(name);
    for (const dep of dependsOn.get(name) ?? []) visit(dep);
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  }

  for (const m of models) visit(m.name);
  return ordered;
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Uso: pnpm backup:restore <ruta-al-zip-descargado>");
    process.exit(1);
  }
  if (!existsSync(zipPath)) {
    console.error(`No existe el archivo: ${zipPath}`);
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbNameMatch = dbUrl.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch?.[1] ?? "(desconocida)";

  console.log(`Este script va a INSERTAR datos del backup "${zipPath}" en la base:`);
  console.log(`  ${dbName}`);
  console.log("Esto NO borra lo que ya existe (usa createMany con skipDuplicates) — pero puede dejar datos");
  console.log("mezclados si la base ya tiene actividad real posterior al backup. Recomendado: restaurar sobre");
  console.log("una base vacía/nueva, fuera de horario de tráfico.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Escribe el nombre de la base ("${dbName}") para confirmar: `);
  rl.close();
  if (answer.trim() !== dbName) {
    console.error("No coincide — se cancela sin tocar nada.");
    process.exit(1);
  }

  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const manifestFile = zip.file("manifest.json");
  if (manifestFile) {
    const manifest = JSON.parse(await manifestFile.async("string"));
    console.log(`\nBackup generado el ${manifest.generatedAt}. Tablas: ${Object.keys(manifest.modelCounts ?? {}).length}.`);
  }

  const order = topologicalOrder();
  let restoredModels = 0;
  let restoredRows = 0;
  const skippedFiles: string[] = [];

  for (const modelName of order) {
    const file = zip.file(`data/${modelName}.json`);
    if (!file) continue;
    const rows = JSON.parse(await file.async("string"));
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const accessor = modelAccessor(modelName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[accessor];
    if (!delegate?.createMany) {
      console.warn(`Modelo sin delegate en prisma, se omite: ${modelName}`);
      continue;
    }
    try {
      const result = await delegate.createMany({ data: rows, skipDuplicates: true });
      restoredModels += 1;
      restoredRows += result.count;
      console.log(`  ${modelName}: ${result.count}/${rows.length} filas insertadas`);
    } catch (err) {
      console.error(`  ${modelName}: falló (${err instanceof Error ? err.message : String(err)}) — se continúa con el resto`);
    }
  }

  zip.folder("files")?.forEach((relativePath) => skippedFiles.push(relativePath));

  console.log(`\nListo: ${restoredRows} filas restauradas en ${restoredModels} tablas.`);
  if (skippedFiles.length > 0) {
    console.log(`\nEste backup también incluye ${skippedFiles.length} archivo(s) en files/ (certificados, firmas de convenios,`);
    console.log("facturas) que este script NO resube automáticamente — decide a mano dónde subirlos de vuelta:");
    for (const f of skippedFiles.slice(0, 20)) console.log(`  - files/${f}`);
    if (skippedFiles.length > 20) console.log(`  … y ${skippedFiles.length - 20} más.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
