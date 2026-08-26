/**
 * Ofrece un archivo generado en el browser.
 *
 * El BOM va a propósito: sin él, Excel abre un CSV UTF-8 como si fuera de la
 * codificación del sistema y "Campera técnica" aparece como "CamperaÂ técnica".
 * Es el primer archivo que el comercio abre, y ese detalle decide si confía en
 * la exportación.
 */
export function descargar(nombre: string, contenido: string): void {
  const blob = new Blob(['\ufeff' + contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();

  // Sin revocarla, el blob queda en memoria hasta que se cierre la pestaña.
  URL.revokeObjectURL(url);
}
