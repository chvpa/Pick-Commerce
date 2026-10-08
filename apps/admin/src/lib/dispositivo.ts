/**
 * Un `User-Agent` dicho como lo reconoce una persona: «Chrome en Windows»,
 * «Safari en iPhone». Es lo que hace que una sesión de «Mi cuenta» se lea como
 * «esa soy yo» o «esa no» (ADR-155).
 *
 * El orden importa: el de un iPhone dice «like Mac OS X», el de Android dice
 * «Linux», el de Chrome dice «Safari» y el de Edge dice «Chrome».
 */
export function dispositivoDe(userAgent: string | null): string {
  if (!userAgent) return 'Un navegador sin nombre';

  const navegador = /Edg(e|A|iOS)?\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;

  const sistema = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;

  if (navegador && sistema) return `${navegador} en ${sistema}`;
  return navegador ?? sistema ?? 'Un navegador sin nombre';
}

/** Si es un teléfono o una tableta: decide el ícono. */
export function esMovil(userAgent: string | null): boolean {
  return /iPhone|iPad|Android|Mobile/.test(userAgent ?? '');
}
