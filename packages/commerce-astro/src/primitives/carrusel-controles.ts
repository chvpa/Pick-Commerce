/**
 * Flechas y auto-avance para cualquier carrusel por scroll-snap.
 *
 * Corre en el navegador, sin framework. Es la mejora progresiva de los
 * carruseles del paquete —hero, productos, avisos—, que sin JavaScript siguen
 * funcionando por scroll nativo: esto agrega flechas y, si se pide, el avance
 * solo. Las flechas nacen `hidden` y este script las muestra, así que sin él no
 * queda un control muerto.
 *
 * Una instancia por `[data-carrusel]`, que apunta por `id` a la pista que
 * desliza. El paso es el ancho del primer hijo más el espacio entre hijos: en un
 * hero es la pantalla entera, en un carrusel de productos es una tarjeta.
 *
 * El auto-avance respeta `prefers-reduced-motion` —con la preferencia puesta no
 * arranca— y se detiene mientras el puntero está encima, mientras algo adentro
 * tiene el foco, y mientras la pestaña no se ve. Un carrusel que se mueve bajo
 * el mouse de quien está leyendo es un problema de accesibilidad, no un efecto.
 */

const LISTO = 'data-carrusel-listo';

function paso(pista: HTMLElement): number {
  const primero = pista.firstElementChild as HTMLElement | null;
  if (!primero) return pista.clientWidth;
  const gap = parseFloat(getComputedStyle(pista).columnGap) || 0;
  return primero.getBoundingClientRect().width + gap;
}

function alFinal(pista: HTMLElement): boolean {
  return pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 1;
}

function iniciar(root: HTMLElement): void {
  if (root.hasAttribute(LISTO)) return;
  const pista = document.getElementById(root.dataset.carrusel ?? '');
  if (!pista) return;
  root.setAttribute(LISTO, '');

  const anterior = root.querySelector<HTMLButtonElement>('[data-carrusel-prev]');
  const siguiente = root.querySelector<HTMLButtonElement>('[data-carrusel-next]');

  const mover = (direccion: 1 | -1) => {
    // Al final, la flecha de avanzar vuelve al principio: un carrusel que se
    // frena en la última tarjeta parece roto, y el auto-avance lo necesita.
    if (direccion === 1 && alFinal(pista)) {
      pista.scrollTo({ left: 0 });
      return;
    }
    pista.scrollBy({ left: paso(pista) * direccion });
  };

  anterior?.addEventListener('click', () => mover(-1));
  siguiente?.addEventListener('click', () => mover(1));
  anterior?.removeAttribute('hidden');
  siguiente?.removeAttribute('hidden');

  // Sin nada que deslizar, las flechas sobran y engañan.
  const sobra = () => pista.scrollWidth <= pista.clientWidth + 1;
  const ajustar = () => {
    anterior?.toggleAttribute('hidden', sobra());
    siguiente?.toggleAttribute('hidden', sobra());
  };
  ajustar();
  addEventListener('resize', ajustar, { passive: true });

  const cada = Number(root.dataset.autoplay ?? 0);
  if (!(cada > 0) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let reloj: number | undefined;
  let pausado = false;
  const arrancar = () => {
    if (reloj !== undefined || pausado || document.hidden) return;
    reloj = setInterval(() => mover(1), cada);
  };
  const parar = () => {
    if (reloj === undefined) return;
    clearInterval(reloj);
    reloj = undefined;
  };
  const pausar = () => {
    pausado = true;
    parar();
  };
  const seguir = () => {
    pausado = false;
    arrancar();
  };

  // La pista y las flechas comparten `root` como ancestro sólo cuando el
  // componente las envuelve; se escuchan las dos por separado para no suponerlo.
  for (const el of [pista, root]) {
    el.addEventListener('pointerenter', pausar);
    el.addEventListener('pointerleave', seguir);
    el.addEventListener('focusin', pausar);
    el.addEventListener('focusout', seguir);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? parar() : arrancar()));
  arrancar();
}

function iniciarTodos(): void {
  document.querySelectorAll<HTMLElement>('[data-carrusel]').forEach(iniciar);
}

// `astro:page-load` cubre las páginas con ClientRouter, donde el DOM se
// reemplaza al navegar; el resto arranca con el documento.
document.addEventListener('astro:page-load', iniciarTodos);
if (document.readyState !== 'loading') iniciarTodos();
else document.addEventListener('DOMContentLoaded', iniciarTodos);
