import { test, expect } from "@playwright/test";

/**
 * Flujos: registro (alta de cuenta B2C) y campus del alumno (login,
 * dashboard "continúa donde dejaste", "qué falta para aprobar").
 * Usa el usuario demo sembrado por prisma/seed.ts (alumno@demo.inkademy.com).
 */
test.describe("Registro", () => {
  test("un visitante puede crear una cuenta nueva", async ({ page }) => {
    const uniqueEmail = `e2e.${test.info().workerIndex}.${test.info().repeatEachIndex}.${Date.now()}@example.com`;

    await page.goto("/registro");
    await page.getByLabel("Nombres", { exact: true }).fill("Persona");
    await page.getByLabel("Apellidos", { exact: true }).fill("De Prueba");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(uniqueEmail);
    await page.getByLabel("Contraseña", { exact: true }).fill("Demo1234!");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // Tras registrarse queda autenticado y aterriza en el campus o en completar perfil.
    await expect(page).toHaveURL(/\/(campus|completar-perfil)/, { timeout: 15_000 });
  });
});

test.describe("Campus del alumno", () => {
  test.use({ storageState: undefined });

  test("el alumno demo inicia sesión y ve su dashboard con progreso real", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo electrónico/i).fill("alumno@demo.inkademy.com");
    await page.getByLabel(/contraseña/i).fill("Demo1234!");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    await expect(page).toHaveURL(/\/campus/, { timeout: 15_000 });
    await expect(page.getByText(/hola, camila/i)).toBeVisible();
    await expect(page.getByText(/continúa donde lo dejaste/i)).toBeVisible();
  });

  test("\"Mis cursos\" muestra el avance y qué falta para aprobar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo electrónico/i).fill("alumno@demo.inkademy.com");
    await page.getByLabel(/contraseña/i).fill("Demo1234!");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/campus/, { timeout: 15_000 });

    await page.goto("/campus/cursos");
    await expect(page.getByRole("heading", { name: "Mis cursos" })).toBeVisible();
    // "En curso" ahora fusiona los cursos recién matriculados (0%) con los
    // que ya tienen avance — el alumno demo tiene varios activos a la vez,
    // así que puede haber más de un "% completado" visible en la pestaña.
    await expect(page.getByText(/completado/).first()).toBeVisible();
    await expect(page.getByText(/para aprobar te falta/i).first()).toBeVisible();
  });
});
