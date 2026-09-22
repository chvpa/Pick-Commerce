import { expect, test } from '@playwright/test';
import { DESCRIPCION_E2E, PROPUESTA_E2E } from '../scripts/datos-admin-e2e.ts';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Revisar y publicar una descripción propuesta por la IA (v2 Fase 8).
 *
 * Lo que se prueba es la promesa, que es la misma de ADR-104 y ADR-130: **nada
 * se escribe en el catálogo sin que una persona lo lea**, y cuando lo aprueba,
 * se escribe. La propuesta se siembra: llamar a OpenAI en cada corrida gastaría
 * la clave del comercio y mediría que su API contesta, que no es lo que este
 * smoke cuida —el mismo criterio que `ia.spec.ts` y `fotos-con-ia.spec.ts`—.
 *
 * El caso «sin credencial» no se repite acá: es la misma ruta
 * `/api/ia/enriquecer` que ya cubre `ia.spec.ts`.
 *
 * Corre sobre la segunda tienda, que el teardown borra.
 */

/*
 * Sólo en escritorio: la propuesta sembrada es **una**, y el primer proyecto que
 * la publique deja al otro sin nada que revisar. Además es la pantalla que se usa
 * sentado, leyendo.
 */
const SOLO_ESCRITORIO = 'se revisa una vez, en escritorio';

test.describe('Descripciones', () => {
  test('la propuesta se lee entera y no se publica sola', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
    await entrar(page);
    await irALaTiendaDelSmoke(page);
    await page.goto(`${ADMIN}/productos/descripciones`);

    const tarjeta = page
      .getByRole('list', { name: 'Descripciones propuestas' })
      .getByRole('listitem')
      .filter({ hasText: PROPUESTA_E2E.title });
    await expect(tarjeta).toBeVisible({ timeout: 15_000 });

    // El texto completo, no un recorte: se aprueba lo que se leyó.
    await expect(tarjeta).toContainText(DESCRIPCION_E2E.texto);

    // Y mientras nadie apruebe, el producto sigue sin descripción.
    await page.goto(`${ADMIN}/productos/${PROPUESTA_E2E.productoId}`);
    await expect(page.getByRole('heading', { name: 'Editar producto' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Descripción')).toHaveValue('');
  });

  test('publicar una propuesta escribe la descripción del producto', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
    await entrar(page);
    await irALaTiendaDelSmoke(page);
    await page.goto(`${ADMIN}/productos/descripciones`);

    const tarjeta = page
      .getByRole('list', { name: 'Descripciones propuestas' })
      .getByRole('listitem')
      .filter({ hasText: PROPUESTA_E2E.title });
    await expect(tarjeta).toBeVisible({ timeout: 15_000 });
    await tarjeta.getByRole('button', { name: 'Publicar' }).click();

    // Sale de la cola de revisión: ya se decidió.
    await expect(tarjeta).toHaveCount(0, { timeout: 15_000 });

    await page.goto(`${ADMIN}/productos/${PROPUESTA_E2E.productoId}`);
    await expect(page.getByRole('heading', { name: 'Editar producto' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Descripción')).toHaveValue(DESCRIPCION_E2E.texto);
  });
});
