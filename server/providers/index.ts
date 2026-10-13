import { kpiConfig } from '../../config/kpi.config.js';
import type { Env } from '../env.js';
import { DemoSource } from './demo.js';
import { EconomicSource } from './economic.js';
import { ManuelLager, ManuelSource } from './manuel.js';
import { CaseSystemSource } from './sagssystem.js';
import type { CaseSource, DataProvider, RevenueSource } from './types.js';

/** Vælger datakilder ud fra miljøvariabler. */
export function opretProvider(env: Env): DataProvider {
  const demo = new DemoSource();
  const brugerManuel = env.CASE_SOURCE === 'manuel' || env.REVENUE_SOURCE === 'manuel';
  const lager = brugerManuel ? new ManuelLager(env.MANUEL_FIL) : null;
  const manuel = lager ? new ManuelSource(lager) : null;

  const sager: CaseSource =
    env.CASE_SOURCE === 'sagssystem' ? new CaseSystemSource(env.CASE_DB_URL) : env.CASE_SOURCE === 'manuel' ? manuel! : demo;

  const omsaetning: RevenueSource =
    env.REVENUE_SOURCE === 'economic'
      ? new EconomicSource({
          appSecretToken: required(env.ECONOMIC_APP_SECRET_TOKEN, 'ECONOMIC_APP_SECRET_TOKEN'),
          agreementGrantToken: required(env.ECONOMIC_AGREEMENT_GRANT_TOKEN, 'ECONOMIC_AGREEMENT_GRANT_TOKEN'),
          mapping: kpiConfig.economic,
          omsaetningsgrundlag: kpiConfig.omsaetningsgrundlag,
        })
      : env.REVENUE_SOURCE === 'manuel'
        ? manuel!
        : demo;

  return { sager, omsaetning, demo: sager === demo || omsaetning === demo, manuel: lager };
}

function required(v: string | undefined, navn: string): string {
  if (!v) throw new Error(`${navn} mangler i .env`);
  return v;
}
