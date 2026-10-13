import type { Omsaetningspost } from '../../shared/types.js';
import type { SagsData } from '../kpi/dashboard.js';
import type { ManuelLager } from './manuel.js';

/** Kilde til sagsdata: enkeltsager (sagssystem/demo) eller dagstal (manuel). Skal være read-only. */
export interface CaseSource {
  readonly navn: string;
  getCaseData(): Promise<SagsData>;
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
  /** Sat når tal tastes manuelt — giver adgang til /api/manuel. */
  readonly manuel: ManuelLager | null;
}
