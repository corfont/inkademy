import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas e2e de los flujos críticos (registro, catálogo, campus, evaluación,
 * certificado, agenda, B2B) contra la app real corriendo en local.
 *
 * Requiere que `apps/api` (puerto definido por API_BASE_URL, default :4000)
 * esté corriendo contra una base de datos sembrada (`pnpm prisma:seed`) y que
 * `apps/web` esté disponible en BASE_URL (default :3000). Si no hay un
 * servidor ya corriendo, Playwright levanta uno con `webServer` usando
 * `pnpm --filter @inkademy/web dev`.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  // Varios specs comparten las mismas cuentas demo (alumno@demo.inkademy.com,
  // etc.) para iniciar sesión. Ahora que solo se permite una sesión activa
  // por cuenta a la vez (login nuevo cierra la anterior — pedido explícito
  // de seguridad), dos specs corriendo en paralelo y logueándose con la
  // misma cuenta se pisan entre sí y uno queda desautenticado a mitad de
  // prueba. Un solo worker evita esa colisión sin tener que darle a cada
  // spec su propia cuenta dedicada.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // El locale por defecto de la app se resuelve por Accept-Language (sin
    // cookie de idioma todavía); el navegador de Playwright manda "en-US"
    // por defecto, lo que serviría la web en inglés y rompería los
    // selectores en español. Forzamos es-PE para reflejar el público
    // objetivo real (Perú/LatAm).
    locale: "es-PE",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "pnpm --filter @inkademy/web dev -- -p 3000",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        cwd: "../..",
      },
});
