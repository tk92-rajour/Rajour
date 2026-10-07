import type { Omsaetningspost, Sag } from '../../shared/types.js';

/** Kilde til sager (sagssystemet). Skal være read-only. */
export interface CaseSource {
  readonly navn: string;
  getCases(): Promise<Sag[]>;
}

/** Kilde til realiseret omsætning (e-conomic). Skal være read-only. */
export interface RevenueSource {
  readonly navn: string;
  /** Salærposter med dato i [fra, til). Kreditnotaer som negative beløb. */
  getRevenueEntries(fra: Date, til: Date): Promise<Omsaetningspost[]>;
}

/** Samlet datalag, som serveren bruger. Vælges via miljøvariabler (CASE_SOURCE / REVENUE_SOURCE). */
export interface DataProvider {
  readonly sager: CaseSource;
  readonly omsaetning: RevenueSource;
  readonly demo: boolean;
}
