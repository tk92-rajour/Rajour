import { differenceInCalendarDays } from 'date-fns';
import type { Behandlingstid, Sag, Sammenligning, Sagstype } from '../../shared/types.js';
import type { KpiConfig } from '../../config/kpi.config.js';
import { aktuelPeriodeTilDato, forrigePeriode, iInterval, type Interval } from './perioder.js';
import { gennemsnit, median, sammenlign, sum } from './statistik.js';

export function erLukket(sag: Sag, lukkedeStatusser: string[]): boolean {
  const s = sag.status.trim().toLowerCase();
  return lukkedeStatusser.some((l) => l.trim().toLowerCase() === s);
}

/** KPI 1: Åbne sager = status ikke i lukkedeStatusser (og oprettet senest nu). */
export function aabneSager(sager: Sag[], nu: Date, lukkedeStatusser: string[]): Sag[] {
  return sager.filter((s) => s.oprettet <= nu && !erLukket(s, lukkedeStatusser));
}

/** Sager lukket inden for intervallet. Kræver lukket status OG en lukkedato. */
export function lukketIInterval(sager: Sag[], iv: Interval, lukkedeStatusser: string[]): Sag[] {
  return sager.filter((s) => s.lukket !== null && erLukket(s, lukkedeStatusser) && iInterval(s.lukket, iv));
}

/** KPI 2: Lukket i indeværende ISO-uge (man–søn) med sammenligning mod forrige uge. */
export function lukketDenneUge(
  sager: Sag[],
  nu: Date,
  cfg: Pick<KpiConfig, 'lukkedeStatusser' | 'sammenligning'>,
): Sammenligning {
  const nuIv = aktuelPeriodeTilDato('uge', nu);
  const forrigeIv = forrigePeriode('uge', nu, cfg.sammenligning);
  return sammenlign(
    lukketIInterval(sager, nuIv, cfg.lukkedeStatusser).length,
    lukketIInterval(sager, forrigeIv, cfg.lukkedeStatusser).length,
  );
}

/** Forventet salær for én sag: feltet, ellers sandsynlighed × forventet indtægt for sagstypen. */
export function forventetSalaer(sag: Sag, fallback: KpiConfig['pipelineFallback']): { beloeb: number; fallback: boolean } {
  if (sag.forventetSalaer !== null && Number.isFinite(sag.forventetSalaer)) {
    return { beloeb: sag.forventetSalaer, fallback: false };
  }
  const f = fallback[sag.type as Sagstype];
  return { beloeb: f ? f.sandsynlighed * f.forventetIndtaegt : 0, fallback: true };
}

/** KPI 3: Pipeline = sum af forventet salær på åbne sager. */
export function pipeline(
  sager: Sag[],
  nu: Date,
  cfg: Pick<KpiConfig, 'lukkedeStatusser' | 'pipelineFallback'>,
): { beloeb: number; antalSager: number; antalMedFallback: number } {
  const aabne = aabneSager(sager, nu, cfg.lukkedeStatusser);
  const vaerdier = aabne.map((s) => forventetSalaer(s, cfg.pipelineFallback));
  return {
    beloeb: sum(vaerdier.map((v) => v.beloeb)),
    antalSager: aabne.length,
    antalMedFallback: vaerdier.filter((v) => v.fallback).length,
  };
}

/**
 * KPI 5: Behandlingstid i kalenderdage fra oprettelse til lukning, for sager lukket i intervallet.
 * Lukket samme dag som oprettet = 0 dage. Sager med lukkedato før oprettelse (datafejl) udelades.
 */
export function behandlingstid(sager: Sag[], iv: Interval, lukkedeStatusser: string[]): Behandlingstid {
  const dage = lukketIInterval(sager, iv, lukkedeStatusser)
    .map((s) => differenceInCalendarDays(s.lukket as Date, s.oprettet))
    .filter((d) => d >= 0);
  return { antal: dage.length, gennemsnitDage: gennemsnit(dage), medianDage: median(dage) };
}
