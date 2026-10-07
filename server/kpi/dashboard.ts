import { PERIODER, type DashboardData, type Omsaetningspost, type Periode, type PeriodeKpi, type Sag } from '../../shared/types.js';
import type { KpiConfig } from '../../config/kpi.config.js';
import { aktuelPeriodeTilDato, forrigePeriode } from './perioder.js';
import { aabneSager, behandlingstid, lukketDenneUge, pipeline } from './sager.js';
import { fordelingPaaSagstype, omsaetningPrUge, realiseretOmsaetning } from './omsaetning.js';

export type DashboardKpi = Pick<DashboardData, 'aabneSager' | 'lukketDenneUge' | 'pipeline' | 'perioder' | 'omsaetningPrUge'>;

/** Samler alle KPI'er i én ren funktion: (data, tidspunkt, config) → tal. */
export function beregnDashboard(sager: Sag[], poster: Omsaetningspost[], nu: Date, cfg: KpiConfig): DashboardKpi {
  const perioder = Object.fromEntries(
    PERIODER.map((periode): [Periode, PeriodeKpi] => {
      const nuIv = aktuelPeriodeTilDato(periode, nu);
      const forrigeIv = forrigePeriode(periode, nu, cfg.sammenligning);
      return [
        periode,
        {
          periode,
          fra: nuIv.fra.toISOString(),
          til: nuIv.til.toISOString(),
          omsaetning: realiseretOmsaetning(poster, nuIv, forrigeIv),
          behandlingstid: behandlingstid(sager, nuIv, cfg.lukkedeStatusser),
          fordeling: fordelingPaaSagstype(poster, nuIv),
        },
      ];
    }),
  ) as Record<Periode, PeriodeKpi>;

  return {
    aabneSager: aabneSager(sager, nu, cfg.lukkedeStatusser).length,
    lukketDenneUge: lukketDenneUge(sager, nu, cfg),
    pipeline: pipeline(sager, nu, cfg),
    perioder,
    omsaetningPrUge: omsaetningPrUge(poster, nu, cfg.ugerITrend),
  };
}
