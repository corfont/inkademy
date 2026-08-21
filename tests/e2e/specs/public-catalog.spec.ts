import { test, expect } from "@playwright/test";

/**
 * Flujo: descubrimiento — home editorial (split B2C/B2B), catálogo con
 * filtros y ficha de curso. No requiere sesión.
 */
test.describe("Catálogo público", () => {
  test("la home muestra el split B2C/B2B y secciones curadas con cursos reales", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /aprende lo que tu carrera necesita/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /explorar catálogo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /ver soluciones para empresas/i })).toBeVisible();

    // Al menos una sección curada con al menos una tarjeta de curso real (sembrada por prisma/seed.ts).
    await expect(page.getByRole("heading", { name: "Destacados" })).toBeVisible();
    await expect(page.getByRole("button", { name: /inscribirme/i }).first()).toBeVisible();
  });

  test("el catálogo lista cursos y permite abrir una ficha de curso", async ({ page }) => {
    await page.goto("/catalogo");
    await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();

    // Filtros decisivos del pedido original.
    await expect(page.getByLabel("Área", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Modalidad", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Nivel", { exact: true })).toBeVisible();

    const firstCourseLink = page.locator('a[href^="/cursos/"]').first();
    await expect(firstCourseLink).toBeVisible();
    await firstCourseLink.click();

    await expect(page).toHaveURL(/\/cursos\//);
    // Ficha de curso: precio, botón de inscripción y contenido del curso.
    await expect(page.getByRole("button", { name: /inscribirme/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contenido del curso" })).toBeVisible();
  });
});
