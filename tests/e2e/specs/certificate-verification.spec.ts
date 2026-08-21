import { test, expect } from "@playwright/test";

/**
 * Flujo: verificación pública de certificado por código (sin sesión).
 * Usa el certificado de ejemplo emitido por prisma/seed.ts para el alumno
 * demo. El código NO es estable entre corridas del seed (se genera con
 * `cuid()`), así que se resuelve dinámicamente contra la API en vez de
 * hardcodearlo.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

test.describe("Verificación de certificado", () => {
  let seededCode: string;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: "alumno@demo.inkademy.com", password: "Demo1234!" },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = await loginRes.json();

    const certsRes = await request.get(`${API_URL}/me/certificates`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(certsRes.ok()).toBeTruthy();
    const certs = await certsRes.json();
    expect(certs.length, "el alumno demo no tiene certificados — ¿corriste prisma/seed.ts?").toBeGreaterThan(0);
    seededCode = certs[0].code;
  });

  test("un código válido muestra el certificado como vigente con los datos del titular", async ({ page }) => {
    await page.goto(`/verificar/${seededCode}`);

    await expect(page.getByRole("heading", { name: /verificación de certificado/i })).toBeVisible();
    await expect(page.getByText(/certificado válido y vigente/i)).toBeVisible();
    await expect(page.getByText("Camila Ramírez")).toBeVisible();
  });

  test("un código inexistente se marca como no válido, sin filtrar datos", async ({ page }) => {
    await page.goto("/verificar/codigo-que-no-existe-123");

    await expect(page.getByRole("heading", { name: /verificación de certificado/i })).toBeVisible();
    await expect(page.getByText(/certificado válido y vigente/i)).not.toBeVisible();
  });
});
