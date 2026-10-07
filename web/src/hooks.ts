import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData } from '../../shared/types';

const STANDARD_POLL_SEK = 60;
const TIMEOUT_MS = 15_000;

export interface DashboardTilstand {
  data: DashboardData | null;
  /** Fejl ved seneste hentning fra serveren (data er så de sidst kendte). */
  fejl: string | null;
  indlaeser: boolean;
}

/**
 * Henter /api/dashboard og poller med det interval, serveren angiver.
 * Ved fejl beholdes sidst kendte data — skærmen bliver aldrig tom.
 */
export function useDashboard(): DashboardTilstand {
  const [tilstand, setTilstand] = useState<DashboardTilstand>({ data: null, fejl: null, indlaeser: true });
  const intervalRef = useRef(STANDARD_POLL_SEK);

  const hent = useCallback(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/api/dashboard', { signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 503) throw new Error('Serveren henter data — vent et øjeblik');
      if (!res.ok) throw new Error(`Serveren svarede ${res.status}`);
      const data = (await res.json()) as DashboardData;
      intervalRef.current = data.visning.klientOpdateringSek || STANDARD_POLL_SEK;
      setTilstand({ data, fejl: null, indlaeser: false });
    } catch (e) {
      const besked =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Serveren svarer ikke'
          : e instanceof TypeError
            ? 'Ingen forbindelse til serveren'
            : e instanceof Error
              ? e.message
              : 'Ukendt fejl';
      setTilstand((s) => ({ ...s, fejl: besked, indlaeser: false }));
    } finally {
      clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    let aktiv = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await hent();
      if (aktiv) timer = setTimeout(loop, intervalRef.current * 1000);
    };
    void loop();
    // Hent straks, når fanen bliver synlig igen (laptop har været i dvale).
    const synlig = () => document.visibilityState === 'visible' && void hent();
    document.addEventListener('visibilitychange', synlig);
    return () => {
      aktiv = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', synlig);
    };
  }, [hent]);

  return tilstand;
}

/** Aktuelt tidspunkt, opdateret hvert `sek` sekund (til "data er forældet"-tjek og ur). */
export function useNu(sek = 30): Date {
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), sek * 1000);
    return () => clearInterval(t);
  }, [sek]);
  return nu;
}

/** Læs/skriv en værdi i localStorage — fejler stille (privat vindue, blokeret lager). */
export function laesLager(noegle: string): string | null {
  try {
    return localStorage.getItem(noegle);
  } catch {
    return null;
  }
}

export function skrivLager(noegle: string, vaerdi: string): void {
  try {
    localStorage.setItem(noegle, vaerdi);
  } catch {
    /* ignorer */
  }
}
