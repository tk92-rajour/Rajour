// Sags-KPI'er beregnet ud fra manuelt indtastede dagstal i stedet for enkeltsager.
// Samme definitioner som server/kpi/sager.ts — se docs/KPI-DEFINITIONER.md.

import { SAGSTYPER, type Behandlingstid, type Dagsregistrering, type Omsaetningspost, type Sammenligning } from '../../shared/types.js';
import type { KpiConfig } from '../../config/kpi.config.js';
import { aktuelPeriodeTilDato, forrigePeriode, iInterval, type Interval } from './perioder.js';
import { gennemsnit, median, sammenlign } from './statistik.js';

/** 'YYYY-MM-DD' → lokal midnat. */
export function datoFraIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lokal dato → 'YYYY-MM-DD'. */
export function isoFraDato(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function iPeriode(r: Dagsregistrering, iv: Interval): boolean {
  return iInterval(datoFraIso(r.dato), iv);
}

/** Seneste registrering (≤ ref) med en værdi i feltet — øjebliksbilleder bæres frem, til der tastes en ny værdi. */
function senesteVaerdi(dage: Dagsregistrering[], ref: Date, felt: 'aabneSager' | 'pipeline'): number {
  let bedst: Dagsregistrering | null = null;
  for (const r of dage) {
    if (r[felt] === null || datoFraIso(r.dato) > ref) continue;
    if (!bedst || r.dato > bedst.dato) bedst = r;
  }
  return bedst?.[felt] ?? 0;
}

/** KPI 1 */
export function aabneSagerFraDage(dage: Dagsregistrering[], ref: Date): number {
  return senesteVaerdi(dage, ref, 'aabneSager');
}

/** KPI 2 */
export function lukketDenneUgeFraDage(
  dage: Dagsregistrering[],
  ref: Date,
  cfg: Pick<KpiConfig, 'sammenligning'>,
): Sammenligning {
  const antal = (iv: Interval) => dage.filter((r) => iPeriode(r, iv)).reduce((a, r) => a + r.lukkedeSager, 0);
  return sammenlign(antal(aktuelPeriodeTilDato('uge', ref)), antal(forrigePeriode('uge', ref, cfg.sammenligning)));
}

/** KPI 3 — beløb er indtastet direkte; antal sager = åbne sager samme dag. */
export function pipelineFraDage(dage: Dagsregistrering[], ref: Date) {
  return {
    beloeb: senesteVaerdi(dage, ref, 'pipeline'),
    antalSager: aabneSagerFraDage(dage, ref),
    antalMedFallback: 0,
  };
}

/** KPI 5 — kun dage, hvor der er angivet behandlingstid pr. lukket sag. */
export function behandlingstidFraDage(dage: Dagsregistrering[], iv: Interval): Behandlingstid {
  const alle = dage.filter((r) => iPeriode(r, iv)).flatMap((r) => r.behandlingsdage);
  return { antal: alle.length, gennemsnitDage: gennemsnit(alle), medianDage: median(alle) };
}

/** Omsætning pr. sagstype pr. dag → omsætningsposter, så KPI 4, 6 og ugetrenden genbruger de samme funktioner. */
export function omsaetningFraDage(dage: Dagsregistrering[]): Omsaetningspost[] {
  return dage.flatMap((r) =>
    SAGSTYPER.filter((t) => r.omsaetning[t] !== 0).map((t) => ({
      dato: datoFraIso(r.dato),
      beloebEksMoms: r.omsaetning[t],
      sagstype: t,
    })),
  );
}

/** Slutningen af seneste indtastede dag (≤ nu). Uden indtastninger: nu. */
export function referencetidFraDage(dage: Dagsregistrering[], nu: Date): Date {
  const idag = isoFraDato(nu);
  const seneste = dage.map((r) => r.dato).filter((d) => d <= idag).sort().at(-1);
  if (!seneste) return nu;
  const slut = datoFraIso(seneste);
  slut.setHours(23, 59, 59, 999);
  return slut < nu ? slut : nu;
}
