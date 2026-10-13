import {
  PERIODER,
  type DashboardData,
  type Dagsregistrering,
  type Omsaetningspost,
  type Periode,
  type PeriodeKpi,
  type Sag,
} from '../../shared/types.js';
import type { KpiConfig } from '../../config/kpi.config.js';
import { aktuelPeriodeTilDato, forrigePeriode } from './perioder.js';
import { aabneSager, behandlingstid, lukketDenneUge, pipeline } from './sager.js';
import { aabneSagerFraDage, behandlingstidFraDage, lukketDenneUgeFraDage, pipelineFraDage } from './dage.js';
import { fordelingPaaSagstype, omsaetningPrUge, realiseretOmsaetning } from './omsaetning.js';

export type DashboardKpi = Pick<DashboardData, 'aabneSager' | 'lukketDenneUge' | 'pipeline' | 'perioder' | 'omsaetningPrUge'>;

/** Sagsdata kommer enten som enkeltsager (sagssystem/demo) eller som indtastede dagstal (manuel). */
export type SagsData = { art: 'sager'; sager: Sag[] } | { art: 'dage'; dage: Dagsregistrering[] };

/** Samler alle KPI'er i én ren funktion: (data, tidspunkt, config) → tal. */
export function beregnDashboard(sagsdata: SagsData | Sag[], poster: Omsaetningspost[], nu: Date, cfg: KpiConfig): DashboardKpi {
  const sd: SagsData = Array.isArray(sagsdata) ? { art: 'sager', sager: sagsdata } : sagsdata;

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
          behandlingstid:
            sd.art === 'sager' ? behandlingstid(sd.sager, nuIv, cfg.lukkedeStatusser) : behandlingstidFraDage(sd.dage, nuIv),
          fordeling: fordelingPaaSagstype(poster, nuIv),
        },
      ];
    }),
  ) as Record<Periode, PeriodeKpi>;

  const sagsKpi =
    sd.art === 'sager'
      ? {
          aabneSager: aabneSager(sd.sager, nu, cfg.lukkedeStatusser).length,
          lukketDenneUge: lukketDenneUge(sd.sager, nu, cfg),
          pipeline: pipeline(sd.sager, nu, cfg),
        }
      : {
          aabneSager: aabneSagerFraDage(sd.dage, nu),
          lukketDenneUge: lukketDenneUgeFraDage(sd.dage, nu, cfg),
          pipeline: pipelineFraDage(sd.dage, nu),
        };

  return { ...sagsKpi, perioder, omsaetningPrUge: omsaetningPrUge(poster, nu, cfg.ugerITrend) };
}
