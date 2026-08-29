/**
 * Alto y ancho reales de una imagen WebP, leídos de su encabezado.
 *
 * `product_media` los exige y ni dummyjson ni el proyecto del que se migran
 * las fotos los entregan. Se podría asumir 1000×1000
 * —que es lo que sirve hoy— pero un dato inventado en las dimensiones produce
 * exactamente el salto de layout que la columna existe para evitar (ADR-034).
 * Son 30 bytes por imagen: se leen.
 */
export function dimensionesWebp(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP')
    return null;

  const formato = buf.toString('ascii', 12, 16);
  if (formato === 'VP8X') {
    return {
      width: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
      height: (buf.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }
  if (formato === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (formato === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}
