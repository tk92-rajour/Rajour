// Læser konfiguration fra miljøet (.env indlæses af Node via --env-file eller af systemd/Docker).
// Credentials logges aldrig.

export interface Env {
  HOST: string;
  PORT: number;
  CASE_SOURCE: 'demo' | 'sagssystem';
  REVENUE_SOURCE: 'demo' | 'economic';
  CASE_DB_URL?: string;
  ECONOMIC_APP_SECRET_TOKEN?: string;
  ECONOMIC_AGREEMENT_GRANT_TOKEN?: string;
  /** Hvor ofte serveren henter nye data fra kilderne (sek.). 120–300 anbefales. */
  REFRESH_SECONDS: number;
  /** Hvor ofte browseren spørger serveren (sek.). */
  CLIENT_POLL_SECONDS: number;
  STALE_AFTER_MINUTES: number;
  /** Sekunder mellem periodeskift i tv-visning. 0 = slået fra. */
  TV_ROTATION_SECONDS: number;
  /** Kun tillad forespørgsler fra private/lokale IP-adresser. */
  LAN_ONLY: boolean;
  /** Mappe til cache af sidst kendte (aggregerede) tal. */
  CACHE_DIR: string;
}

function valg<T extends string>(v: string | undefined, tilladte: readonly T[], std: T, navn: string): T {
  if (v === undefined || v === '') return std;
  if (!tilladte.includes(v as T)) throw new Error(`${navn} skal være en af: ${tilladte.join(', ')}`);
  return v as T;
}

function tal(v: string | undefined, std: number, min: number, max: number, navn: string): number {
  if (v === undefined || v === '') return std;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${navn} skal være et tal mellem ${min} og ${max}`);
  return n;
}

export function laesEnv(e: NodeJS.ProcessEnv = process.env): Env {
  return {
    HOST: e.HOST || '0.0.0.0',
    PORT: tal(e.PORT, 8080, 1, 65535, 'PORT'),
    CASE_SOURCE: valg(e.CASE_SOURCE, ['demo', 'sagssystem'] as const, 'demo', 'CASE_SOURCE'),
    REVENUE_SOURCE: valg(e.REVENUE_SOURCE, ['demo', 'economic'] as const, 'demo', 'REVENUE_SOURCE'),
    CASE_DB_URL: e.CASE_DB_URL || undefined,
    ECONOMIC_APP_SECRET_TOKEN: e.ECONOMIC_APP_SECRET_TOKEN || undefined,
    ECONOMIC_AGREEMENT_GRANT_TOKEN: e.ECONOMIC_AGREEMENT_GRANT_TOKEN || undefined,
    REFRESH_SECONDS: tal(e.REFRESH_SECONDS, 180, 30, 3600, 'REFRESH_SECONDS'),
    CLIENT_POLL_SECONDS: tal(e.CLIENT_POLL_SECONDS, 60, 10, 600, 'CLIENT_POLL_SECONDS'),
    STALE_AFTER_MINUTES: tal(e.STALE_AFTER_MINUTES, 15, 1, 1440, 'STALE_AFTER_MINUTES'),
    TV_ROTATION_SECONDS: tal(e.TV_ROTATION_SECONDS, 30, 0, 3600, 'TV_ROTATION_SECONDS'),
    LAN_ONLY: (e.LAN_ONLY ?? 'true').toLowerCase() !== 'false',
    CACHE_DIR: e.CACHE_DIR || './data',
  };
}
