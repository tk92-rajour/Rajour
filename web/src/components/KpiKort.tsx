import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { aendring, forskel } from '../../../shared/format';

interface Props {
  etiket: string;
  periode?: string;
  vaerdi: ReactNode;
  enhed?: string;
  detalje?: ReactNode;
  /** Ekstra forklaring ved hover (laptop). */
  forklaring?: string;
}

/**
 * Skalerer tallet ned, hvis det ikke kan være i kortet (fx store beløb på storskærm),
 * i stedet for at afskære det.
 */
function useTilpasBredde<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tilpas = () => {
      el.style.fontSize = '';
      const fuld = el.scrollWidth;
      const plads = el.clientWidth;
      if (fuld > plads && fuld > 0) {
        const basis = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${Math.floor(basis * (plads / fuld) * 0.98)}px`;
      }
    };
    tilpas();
    const ro = new ResizeObserver(tilpas);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export function KpiKort({ etiket, periode, vaerdi, enhed, detalje, forklaring }: Props) {
  const vaerdiRef = useTilpasBredde<HTMLDivElement>([vaerdi, enhed]);
  return (
    <section className={periode ? 'kort periodisk' : 'kort'} title={forklaring}>
      <div className="kort-etiket">
        <span>{etiket}</span>
        {periode && <span className="periode-maerke">{periode}</span>}
      </div>
      <div className="kort-vaerdi" ref={vaerdiRef}>
        {vaerdi}
        {enhed && <span className="enhed">{enhed}</span>}
      </div>
      {detalje && <div className="kort-detalje">{detalje}</div>}
    </section>
  );
}

export function KortSkelet() {
  return (
    <section className="kort" aria-hidden="true">
      <div className="skelet" style={{ width: '55%' }} />
      <div className="skelet" style={{ width: '70%', height: '2.2em', marginTop: 14 }} />
      <div className="skelet" style={{ width: '45%', marginTop: 12 }} />
    </section>
  );
}

interface DeltaProps {
  /** Procentvis ændring (null = ikke defineret, fx forrige var 0). */
  pct?: number | null;
  /** Absolut forskel i antal (bruges når pct ikke giver mening). */
  antal?: number;
  sammenlignetMed: string;
}

/** Ændring mod forrige periode med pil + tekst (aldrig kun farve). Op = godt for alle vores KPI'er. */
export function Delta({ pct, antal, sammenlignetMed }: DeltaProps) {
  const v = pct ?? antal ?? null;
  if (v === null) {
    return <span className="daempet">Ingen sammenligning {sammenlignetMed}</span>;
  }
  const retning = Math.round(v * 10) === 0 ? 'neutral' : v > 0 ? 'op' : 'ned';
  const pil = retning === 'op' ? '▲' : retning === 'ned' ? '▼' : '■';
  const tekst = pct !== undefined && pct !== null ? aendring(pct) : forskel(antal ?? 0);
  return (
    <span>
      <span className={`delta ${retning}`}>
        <span aria-hidden="true">{pil}</span> {tekst}
      </span>{' '}
      <span className="daempet">vs. {sammenlignetMed}</span>
    </span>
  );
}
