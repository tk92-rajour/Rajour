// Alle datoberegninger sker i dansk tid, uanset maskinens indstilling.
// (Sættes også i .env/systemd/Docker; Node læser TZ ved første datoberegning.)
process.env.TZ ||= 'Europe/Copenhagen';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kpiConfig } from '../config/kpi.config.js';
import { byggApp } from './app.js';
import { laesEnv } from './env.js';
import { Opdatering } from './opdatering.js';
import { opretProvider } from './providers/index.js';

const env = laesEnv();
const here = path.dirname(fileURLToPath(import.meta.url));
// Bygget: dist/server/index.js → dist/web. Udvikling (tsx): server/index.ts → dist/web.
const webDir = path.resolve(here, here.endsWith(path.join('dist', 'server')) ? '../web' : '../dist/web');

const provider = opretProvider(env);
let opdatering: Opdatering | undefined;
const app = byggApp(env, () => opdatering?.hent() ?? null, webDir);
opdatering = new Opdatering(provider, kpiConfig, env, app.log);

app.log.info(
  { sager: provider.sager.navn, omsaetning: provider.omsaetning.navn, opdateringSek: env.REFRESH_SECONDS, lanOnly: env.LAN_ONLY },
  'Starter KPI-dashboard',
);

await opdatering.start();
await app.listen({ host: env.HOST, port: env.PORT });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    opdatering?.stop();
    await app.close();
    process.exit(0);
  });
}
