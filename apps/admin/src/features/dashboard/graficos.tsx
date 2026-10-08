/**
 * Los gráficos chicos de los indicadores del Inicio, como los dibuja el handoff
 * (ADR-143): una línea, unas barras, un reparto y un medidor.
 *
 * SVG y CSS a mano y no una librería: son cuatro formas fijas de cuarenta
 * píxeles de alto, sin ejes ni interacción, y una librería de gráficos sería una
 * dependencia nueva para dibujar lo que entra en estas líneas.
 *
 * Son decorado del número que tienen arriba, que es el dato: por eso van
 * `aria-hidden`. Lo que dicen ya está escrito en el texto de la tarjeta.
 */

const ANCHO = 140;
const ALTO = 40;

function trazo(valores: readonly number[], maximo: number): string {
  if (valores.length === 0) return '';
  const paso = valores.length > 1 ? ANCHO / (valores.length - 1) : 0;
  return valores
    .map((v, i) => {
      const x = (i * paso).toFixed(1);
      const y = (ALTO - (maximo > 0 ? v / maximo : 0) * ALTO).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

/** La línea del período y, punteada, la del anterior: la misma escala para las dos. */
export function Linea({
  actual,
  anterior,
}: {
  actual: readonly number[];
  anterior?: readonly number[];
}) {
  const maximo = Math.max(1, ...actual, ...(anterior ?? []));
  const linea = trazo(actual, maximo);
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        className="h-10 w-full overflow-visible"
      >
        {linea && <path d={`${linea} L${ANCHO} ${ALTO} L0 ${ALTO} Z`} fill="#eef1fd" />}
        {anterior && anterior.length > 0 && (
          <path
            d={trazo(anterior, maximo)}
            fill="none"
            stroke="#b9c0cf"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={linea}
          fill="none"
          stroke="#3b5bdb"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="text-muted-foreground flex gap-3 text-[11.5px]">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-2.5 bg-[#3b5bdb]" />
          Este período
        </span>
        {anterior && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 border-t-2 border-dashed border-[#b9c0cf]" />
            Anterior
          </span>
        )}
      </div>
    </div>
  );
}

/** Una barra por hora o por día; la última, la de ahora, en el color fuerte. */
export function Barras({
  valores,
  desde,
  hasta,
}: {
  valores: readonly number[];
  desde: string;
  hasta: string;
}) {
  const maximo = Math.max(1, ...valores);
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <div className="flex h-10 items-end gap-[3px]">
        {valores.map((v, i) => (
          <div
            key={i}
            className="min-h-0.5 flex-1 rounded-[2px]"
            style={{
              height: `${(v / maximo) * 100}%`,
              background: i === valores.length - 1 ? '#3b5bdb' : '#dfe5fb',
            }}
          />
        ))}
      </div>
      <div className="text-muted-foreground flex justify-between text-[11.5px]">
        <span>{desde}</span>
        <span>{hasta}</span>
      </div>
    </div>
  );
}

const COLORES_DEL_REPARTO = ['#c9d4f8', '#7d93ea', '#3b5bdb'] as const;

/** Cómo se reparte un total en tramos, en una barra y con su porcentaje. */
export function Reparto({
  tramos,
  locale,
}: {
  tramos: readonly { readonly etiqueta: string; readonly n: number }[];
  locale: string;
}) {
  const total = tramos.reduce((a, t) => a + t.n, 0);
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded" aria-hidden="true">
        {tramos.map((t, i) => (
          <span
            key={t.etiqueta}
            style={{
              width: `${total > 0 ? (t.n / total) * 100 : 0}%`,
              background: COLORES_DEL_REPARTO[i],
            }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-[3px]">
        {tramos.map((t, i) => (
          <li key={t.etiqueta} className="text-ink-3 flex items-center gap-1.5 text-[11.5px]">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: COLORES_DEL_REPARTO[i] }}
            />
            <span className="flex-1">{t.etiqueta}</span>
            <span className="text-foreground tabular-nums">
              {pct.format(total > 0 ? t.n / total : 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Una tasa sobre una escala, con la marca de dónde estaba antes.
 *
 * La escala no es fija: va hasta un poco más de la mayor de las dos tasas, con
 * un piso de 4 %. Fija en 4 % —como la dibuja el handoff— una tienda con 6 % de
 * conversión se saldría de la barra.
 */
export function Medidor({
  actual,
  anterior,
  etiquetaAnterior,
}: {
  actual: number;
  anterior: number | null;
  etiquetaAnterior: string;
}) {
  const escala = Math.max(0.04, actual * 1.25, (anterior ?? 0) * 1.25);
  const posicion = (v: number) => `${Math.min((v / escala) * 100, 100)}%`;
  return (
    <div className="flex flex-col gap-1.5 pt-2.5">
      <div className="relative h-3 rounded-full bg-[#f1f2f5]" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[#3b5bdb]"
          style={{ width: posicion(actual) }}
        />
        {anterior !== null && (
          <span
            className="absolute -inset-y-[5px] w-0.5 rounded-[1px] bg-[#0e1525]"
            style={{ left: posicion(anterior) }}
          />
        )}
      </div>
      {anterior !== null && (
        <span className="text-muted-foreground flex items-center gap-1.5 text-[11.5px]">
          <span aria-hidden="true" className="h-2.5 w-0.5 bg-[#0e1525]" />
          Antes {etiquetaAnterior}
        </span>
      )}
    </div>
  );
}
