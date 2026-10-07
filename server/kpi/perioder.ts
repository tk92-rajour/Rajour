import {
  addDays,
  addMonths,
  addWeeks,
  getISOWeek,
  getISOWeekYear,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import type { Periode } from '../../shared/types.js';

/** Halvåbent interval [fra, til). Alle datoer i lokal tid (serveren kører med TZ=Europe/Copenhagen). */
export interface Interval {
  fra: Date;
  til: Date;
}

export function iInterval(d: Date, iv: Interval): boolean {
  const t = d.getTime();
  return t >= iv.fra.getTime() && t < iv.til.getTime();
}

function periodeStart(periode: Periode, d: Date): Date {
  switch (periode) {
    case 'dag':
      return startOfDay(d);
    case 'uge':
      return startOfISOWeek(d); // mandag 00:00
    case 'maaned':
      return startOfMonth(d);
  }
}

function naestePeriodeStart(periode: Periode, start: Date): Date {
  switch (periode) {
    case 'dag':
      return addDays(start, 1);
    case 'uge':
      return addWeeks(start, 1);
    case 'maaned':
      return addMonths(start, 1);
  }
}

function sammeTidspunktForrigePeriode(periode: Periode, nu: Date): Date {
  switch (periode) {
    case 'dag':
      return subDays(nu, 1);
    case 'uge':
      return subWeeks(nu, 1);
    case 'maaned':
      // date-fns klemmer til sidste dag i måneden (31. marts → 28./29. feb.)
      return subMonths(nu, 1);
  }
}

/** Hele den aktuelle periode (dag/ISO-uge/måned), som `nu` ligger i. */
export function aktuelPeriode(periode: Periode, nu: Date): Interval {
  const fra = periodeStart(periode, nu);
  return { fra, til: naestePeriodeStart(periode, fra) };
}

/**
 * Den aktuelle periode indtil `nu` — det vi faktisk kan måle.
 * (Data med fremtidige datoer i perioden tælles ikke med.)
 */
export function aktuelPeriodeTilDato(periode: Periode, nu: Date): Interval {
  return { fra: periodeStart(periode, nu), til: nu };
}

/**
 * Forrige tilsvarende periode.
 *  - 'til-dato'   : fra forrige periodes start til samme tidspunkt i forrige periode.
 *  - 'hel-periode': hele forrige periode.
 */
export function forrigePeriode(periode: Periode, nu: Date, maade: 'til-dato' | 'hel-periode'): Interval {
  const aktuelStart = periodeStart(periode, nu);
  const fra = periodeStart(periode, sammeTidspunktForrigePeriode(periode, nu));
  if (maade === 'hel-periode') return { fra, til: aktuelStart };
  const til = sammeTidspunktForrigePeriode(periode, nu);
  // Sikkerhed: forrige interval må aldrig overlappe den aktuelle periode.
  return { fra, til: til > aktuelStart ? aktuelStart : til };
}

export interface IsoUge {
  aar: number;
  uge: number;
  fra: Date;
  til: Date;
}

/** De seneste `antal` ISO-uger inkl. den aktuelle, ældste først. */
export function senesteUger(nu: Date, antal: number): IsoUge[] {
  const denneUge = startOfISOWeek(nu);
  const uger: IsoUge[] = [];
  for (let i = antal - 1; i >= 0; i--) {
    const fra = subWeeks(denneUge, i);
    uger.push({ aar: getISOWeekYear(fra), uge: getISOWeek(fra), fra, til: addWeeks(fra, 1) });
  }
  return uger;
}
