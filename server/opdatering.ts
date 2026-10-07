// Henter data fra kilderne med fast interval, beregner KPI'er og holder sidst kendte tal.
// Hvis en kilde fejler, beholdes sidst kendte rådata for den kilde, og fejlen vises diskret i UI.
// Det beregnede (aggregerede) resultat gemmes på disk, så tallene overlever en genstart.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { addDays, startOfDay, startOfISOWeek, startOfMonth, subMonths, subWeeks } from 'date-fns';
import type { DashboardData, KildeStatus, Omsaetningspost, Sag } from '../shared/types.js';
import type { KpiConfig } from '../config/kpi.config.js';
import type { DataProvider } from './providers/types.js';
import { beregnDashboard } from './kpi/dashboard.js';
import type { Env } from './env.js';

interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

interface KildeTilstand<T> {
  data: T | null;
  status: KildeStatus;
}

function nyKilde<T>(navn: string): KildeTilstand<T> {
  return { data: null, status: { navn, ok: false, sidstOk: null, fejl: null } };
}

/** Kort, persondatafri fejltekst til UI og log. */
function fejltekst(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.slice(0, 200);
}

/** Datointerval der skal hentes omsætning for: nok til trendgraf og forrige måned. */
export function omsaetningsVindue(nu: Date, ugerITrend: number): { fra: Date; til: Date } {
  const fraTrend = subWeeks(startOfISOWeek(nu), ugerITrend);
  const fraMaaned = startOfMonth(subMonths(nu, 1));
  return { fra: fraTrend < fraMaaned ? fraTrend : fraMaaned, til: startOfDay(addDays(nu, 1)) };
}

export class Opdatering {
  private sager = nyKilde<Sag[]>('');
  private omsaetning = nyKilde<Omsaetningspost[]>('');
  private seneste: DashboardData | null = null;
  private timer: NodeJS.Timeout | null = null;
  private koerer = false;

  constructor(
    private readonly provider: DataProvider,
    private readonly cfg: KpiConfig,
    private readonly env: Env,
    private readonly log: Logger,
  ) {
    this.sager.status.navn = `Sager (${provider.sager.navn})`;
    this.omsaetning.status.navn = `Omsætning (${provider.omsaetning.navn})`;
  }

  get cacheFil(): string {
    return path.resolve(this.env.CACHE_DIR, 'dashboard.json');
  }

  hent(): DashboardData | null {
    return this.seneste;
  }

  async start(): Promise<void> {
    await this.indlaesFraDisk();
    await this.koer();
    this.timer = setInterval(() => void this.koer(), this.env.REFRESH_SECONDS * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async hentKilde<T>(k: KildeTilstand<T>, fn: () => Promise<T>): Promise<void> {
    try {
      k.data = await fn();
      k.status = { ...k.status, ok: true, sidstOk: new Date().toISOString(), fejl: null };
    } catch (e) {
      k.status = { ...k.status, ok: false, fejl: fejltekst(e) };
      this.log.warn({ kilde: k.status.navn, fejl: k.status.fejl }, 'Datakilde fejlede — bruger sidst kendte data');
    }
  }

  /** Én opdateringsrunde. Kaster aldrig. */
  async koer(nu = new Date()): Promise<void> {
    if (this.koerer) return; // forrige runde er ikke færdig (fx langsomt API) — spring over
    this.koerer = true;
    try {
      const vindue = omsaetningsVindue(nu, this.cfg.ugerITrend);
      await Promise.all([
        this.hentKilde(this.sager, () => this.provider.sager.getCases()),
        this.hentKilde(this.omsaetning, () => this.provider.omsaetning.getRevenueEntries(vindue.fra, vindue.til)),
      ]);

      const kilder = [this.sager.status, this.omsaetning.status];
      if (this.sager.data && this.omsaetning.data) {
        const kpi = beregnDashboard(this.sager.data, this.omsaetning.data, nu, this.cfg);
        this.seneste = { ...kpi, beregnet: nu.toISOString(), kilder, visning: this.visning(), demo: this.provider.demo };
        await this.gemTilDisk(this.seneste);
        this.log.info(
          { aabneSager: kpi.aabneSager, sager: this.sager.data.length, poster: this.omsaetning.data.length },
          'KPI opdateret',
        );
      } else if (this.seneste) {
        // Ingen rådata endnu (fx genstart mens kilden er nede) — vis tal fra disk med opdateret kildestatus.
        this.seneste = { ...this.seneste, kilder };
      }
    } finally {
      this.koerer = false;
    }
  }

  private visning(): DashboardData['visning'] {
    return {
      klientOpdateringSek: this.env.CLIENT_POLL_SECONDS,
      foraeldetEfterMin: this.env.STALE_AFTER_MINUTES,
      tvRotationSek: this.env.TV_ROTATION_SECONDS,
      sammenligning: this.cfg.sammenligning,
      omsaetningsgrundlag: this.cfg.omsaetningsgrundlag,
    };
  }

  private async gemTilDisk(d: DashboardData): Promise<void> {
    try {
      await mkdir(path.dirname(this.cacheFil), { recursive: true });
      const tmp = `${this.cacheFil}.tmp`;
      await writeFile(tmp, JSON.stringify(d));
      await rename(tmp, this.cacheFil); // atomisk erstatning
    } catch (e) {
      this.log.warn({ fejl: fejltekst(e) }, 'Kunne ikke gemme cache på disk');
    }
  }

  private async indlaesFraDisk(): Promise<void> {
    try {
      const d = JSON.parse(await readFile(this.cacheFil, 'utf8')) as DashboardData;
      // Nyeste visningsindstillinger fra .env vinder over den gemte kopi.
      this.seneste = { ...d, visning: this.visning() };
      this.log.info({ beregnet: d.beregnet }, 'Indlæste sidst kendte tal fra disk');
    } catch {
      /* ingen cache endnu */
    }
  }
}
