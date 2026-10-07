// Fælles typer for datamodel og API-svar. Indeholder bevidst ingen persondata
// (navne, CPR, sags- eller fakturanumre) — kun det, KPI'erne skal bruge.

export const SAGSTYPER = ['InkassoMedAktiver', 'InkassoUdenAktiver', 'Detektiv', 'Konkurs'] as const;
export type Sagstype = (typeof SAGSTYPER)[number];
export type SagstypeEllerUkendt = Sagstype | 'Ukendt';

export const SAGSTYPE_NAVN: Record<SagstypeEllerUkendt, string> = {
  InkassoMedAktiver: 'Inkasso med aktiver',
  InkassoUdenAktiver: 'Inkasso uden aktiver',
  Detektiv: 'Detektivarbejde',
  Konkurs: 'Konkursarbejde',
  Ukendt: 'Ukendt sagstype',
};

/** En sag, som beregningslaget ser den. `id` er kun til intern dedup og sendes aldrig til klienten. */
export interface Sag {
  id: string;
  type: Sagstype;
  status: string;
  oprettet: Date;
  /** Tidspunkt for lukning. null = ikke lukket (eller lukkedato ikke registreret). */
  lukket: Date | null;
  /** Forventet salær i kr. ekskl. moms. null = ikke angivet → fallback fra config. */
  forventetSalaer: number | null;
}

/** En omsætningspost (salær) — fra en fakturalinje eller kreditnota. Negativ ved kreditering. */
export interface Omsaetningspost {
  /** Den dato, der tæller (faktura- eller betalingsdato afhængigt af config). */
  dato: Date;
  beloebEksMoms: number;
  sagstype: SagstypeEllerUkendt;
}

export type Periode = 'dag' | 'uge' | 'maaned';
export const PERIODER: Periode[] = ['dag', 'uge', 'maaned'];

export const PERIODE_NAVN: Record<Periode, string> = {
  dag: 'I dag',
  uge: 'Denne uge',
  maaned: 'Denne måned',
};

export const FORRIGE_PERIODE_NAVN: Record<Periode, string> = {
  dag: 'i går',
  uge: 'forrige uge',
  maaned: 'forrige måned',
};

// ---- API-svar (/api/dashboard) ----

export interface Sammenligning {
  nu: number;
  forrige: number;
  /** Forskel i procent; null hvis forrige er 0 (ikke defineret). */
  aendringPct: number | null;
}

export interface Behandlingstid {
  antal: number;
  gennemsnitDage: number | null;
  medianDage: number | null;
}

export interface TypeFordeling {
  type: SagstypeEllerUkendt;
  beloeb: number;
  /** Andel af total i procent; null hvis total ≤ 0. */
  andelPct: number | null;
}

export interface PeriodeKpi {
  periode: Periode;
  fra: string;
  til: string;
  omsaetning: Sammenligning;
  behandlingstid: Behandlingstid;
  fordeling: TypeFordeling[];
}

export interface UgeOmsaetning {
  aar: number;
  uge: number;
  fra: string;
  beloeb: number;
  igangvaerende: boolean;
}

export interface KildeStatus {
  navn: string;
  ok: boolean;
  /** ISO-tidspunkt for seneste vellykkede hentning. */
  sidstOk: string | null;
  fejl: string | null;
}

export interface DashboardData {
  /** ISO-tidspunkt hvor tallene blev beregnet. */
  beregnet: string;
  aabneSager: number;
  lukketDenneUge: Sammenligning;
  pipeline: { beloeb: number; antalSager: number; antalMedFallback: number };
  perioder: Record<Periode, PeriodeKpi>;
  omsaetningPrUge: UgeOmsaetning[];
  kilder: KildeStatus[];
  visning: {
    klientOpdateringSek: number;
    foraeldetEfterMin: number;
    tvRotationSek: number;
    sammenligning: 'til-dato' | 'hel-periode';
    omsaetningsgrundlag: 'fakturadato' | 'betalingsdato';
  };
  demo: boolean;
}
