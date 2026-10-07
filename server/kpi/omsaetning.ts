import { formatISO } from 'date-fns';
import {
  SAGSTYPER,
  type Omsaetningspost,
  type Sammenligning,
  type SagstypeEllerUkendt,
  type TypeFordeling,
  type UgeOmsaetning,
} from '../../shared/types.js';
import { iInterval, senesteUger, type Interval } from './perioder.js';
import { sammenlign, sum } from './statistik.js';

/** Sum af salær (ekskl. moms) i intervallet. Kreditnotaer er negative og trækkes dermed fra. */
export function omsaetningIInterval(poster: Omsaetningspost[], iv: Interval): number {
  return sum(poster.filter((p) => iInterval(p.dato, iv)).map((p) => p.beloebEksMoms));
}

/** KPI 4: Realiseret omsætning i perioden sammenlignet med forrige tilsvarende periode. */
export function realiseretOmsaetning(poster: Omsaetningspost[], nuIv: Interval, forrigeIv: Interval): Sammenligning {
  return sammenlign(omsaetningIInterval(poster, nuIv), omsaetningIInterval(poster, forrigeIv));
}

/**
 * KPI 6: Omsætning fordelt på sagstype i intervallet.
 * Alle fire sagstyper er altid med (også ved 0 kr.); 'Ukendt' kun hvis der er poster uden sagstype.
 * Andel i % beregnes kun når total > 0.
 */
export function fordelingPaaSagstype(poster: Omsaetningspost[], iv: Interval): TypeFordeling[] {
  const pr = new Map<SagstypeEllerUkendt, number[]>();
  for (const p of poster) {
    if (!iInterval(p.dato, iv)) continue;
    const liste = pr.get(p.sagstype) ?? [];
    liste.push(p.beloebEksMoms);
    pr.set(p.sagstype, liste);
  }
  const typer: SagstypeEllerUkendt[] = [...SAGSTYPER];
  if (pr.has('Ukendt')) typer.push('Ukendt');
  const beloeb = typer.map((type) => ({ type, beloeb: sum(pr.get(type) ?? []) }));
  const total = sum(beloeb.map((b) => b.beloeb));
  return beloeb.map((b) => ({ ...b, andelPct: total > 0 ? (b.beloeb / total) * 100 : null }));
}

/** Omsætning pr. ISO-uge for de seneste `antal` uger (til trendgrafen). */
export function omsaetningPrUge(poster: Omsaetningspost[], nu: Date, antal: number): UgeOmsaetning[] {
  return senesteUger(nu, antal).map((u) => ({
    aar: u.aar,
    uge: u.uge,
    fra: formatISO(u.fra, { representation: 'date' }),
    beloeb: omsaetningIInterval(poster, u),
    igangvaerende: iInterval(nu, u),
  }));
}
