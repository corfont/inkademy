import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Flujo B2B: el administrador de empresa inicia sesión y ve su panel
 * ejecutivo (cupos, colaboradores, reportes). Usa la empresa demo sembrada
 * por prisma/seed.ts ("Corporación Andina S.A.C.").
 *
 * El id de la empresa NO es estable entre corridas de `prisma/seed.ts` (cada
 * fila se crea con un uuid aleatorio, el seed no es idempotente) — se
 * resuelve dinámicamente contra la API con la cuenta admin en vez de
 * hardcodearlo.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login falló para ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.accessToken as string;
}

async function getSeededCompanyId(request: APIRequestContext): Promise<string> {
  const adminToken = await login(request, "admin@demo.inkademy.com", "Demo1234!");
  const res = await request.get(`${API_URL}/admin/companies`, { headers: { Authorization: `Bearer ${adminToken}` } });
  expect(res.ok()).toBeTruthy();
  const companies = await res.json();
  const company = companies.find((c: { legalName: string }) => c.legalName.includes("Corporación Andina"));
  expect(company, "no se encontró la empresa demo 'Corporación Andina S.A.C.' — ¿corriste prisma/seed.ts?").toBeTruthy();
  return company.id as string;
}

test.describe("Panel de empresa (B2B)", () => {
  let companyId: string;

  test.beforeAll(async ({ request }) => {
    companyId = await getSeededCompanyId(request);
  });

  test("el admin de empresa ve el dashboard ejecutivo con cupos y colaboradores", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo electrónico/i).fill("empresa@demo.inkademy.com");
    await page.getByLabel(/contraseña/i).fill("Demo1234!");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/campus/, { timeout: 15_000 });

    await page.goto(`/empresa/${companyId}`);
    await expect(page.getByText(/corporación andina/i)).toBeVisible();

    await page.goto(`/empresa/${companyId}/colaboradores`);
    await expect(page.getByRole("heading", { name: /colaboradores/i })).toBeVisible();
  });

  test("un alumno B2C sin membresía de empresa no puede ver el panel de otra empresa", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo electrónico/i).fill("alumno@demo.inkademy.com");
    await page.getByLabel(/contraseña/i).fill("Demo1234!");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/campus/, { timeout: 15_000 });

    // La API responde 403 (separación estricta B2B); el segmento /empresa
    // tiene su propio error.tsx que debe mostrar un estado de "sin acceso"
    // en vez de datos simulados con apariencia real (ver src/lib/safe-fetch.ts).
    await page.goto(`/empresa/${companyId}`);
    await expect(page.getByText(/corporación andina/i)).not.toBeVisible();
    await expect(page.getByRole("heading", { name: /no pudimos mostrar esta empresa/i })).toBeVisible();
  });
});
