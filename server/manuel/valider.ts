import { SAGSTYPER, SAGSTYPE_NAVN, type Dagsregistrering, type Sagstype } from '../../shared/types.js';

export type Valideringsresultat = { ok: true; vaerdi: Dagsregistrering } | { ok: false; fejl: Record<string, string> };

const MAKS_BELOEB = 100_000_000;
const MAKS_ANTAL = 100_000;
const MAKS_DAGE = 3650 * 3;

function erHeltal(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function erBeloeb(v: unknown, min: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= MAKS_BELOEB;
}

export function erGyldigDato(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000;
}

/**
 * Validerer én dags indtastning. `idag` er 'YYYY-MM-DD' — fremtidige datoer afvises.
 * Fejltekster er på dansk og knyttet til feltnavn, så formularen kan vise dem ved feltet.
 */
export function validerRegistrering(input: unknown, idag: string): Valideringsresultat {
  const fejl: Record<string, string> = {};
  const r = (input ?? {}) as Record<string, unknown>;

  if (!erGyldigDato(r.dato)) fejl.dato = 'Ugyldig dato';
  else if (r.dato > idag) fejl.dato = 'Datoen må ikke ligge i fremtiden';

  const aabne = r.aabneSager ?? null;
  if (aabne !== null && !erHeltal(aabne, 0, MAKS_ANTAL)) fejl.aabneSager = 'Skal være et helt tal, 0 eller derover';

  const pipeline = r.pipeline ?? null;
  if (pipeline !== null && !erBeloeb(pipeline, 0)) fejl.pipeline = 'Skal være et beløb på 0 kr. eller derover';

  const lukkede = r.lukkedeSager ?? 0;
  if (!erHeltal(lukkede, 0, MAKS_ANTAL)) fejl.lukkedeSager = 'Skal være et helt tal, 0 eller derover';

  const dage = r.behandlingsdage ?? [];
  if (!Array.isArray(dage) || !dage.every((d) => erHeltal(d, 0, MAKS_DAGE))) {
    fejl.behandlingsdage = 'Skal være hele dage (0 eller derover), adskilt af komma';
  } else if (dage.length > 0 && typeof lukkede === 'number' && dage.length !== lukkede) {
    fejl.behandlingsdage = `Der er angivet ${dage.length} behandlingstider, men ${lukkede} lukkede sager`;
  }

  const oms = (r.omsaetning ?? {}) as Record<string, unknown>;
  const omsaetning = {} as Record<Sagstype, number>;
  for (const t of SAGSTYPER) {
    const v = oms[t] ?? 0;
    if (!erBeloeb(v, -MAKS_BELOEB)) fejl[`omsaetning.${t}`] = `${SAGSTYPE_NAVN[t]}: ugyldigt beløb`;
    else omsaetning[t] = Math.round(v * 100) / 100;
  }

  if (Object.keys(fejl).length > 0) return { ok: false, fejl };
  return {
    ok: true,
    vaerdi: {
      dato: r.dato as string,
      aabneSager: aabne as number | null,
      pipeline: pipeline === null ? null : Math.round((pipeline as number) * 100) / 100,
      lukkedeSager: lukkede as number,
      behandlingsdage: dage as number[],
      omsaetning,
    },
  };
}
