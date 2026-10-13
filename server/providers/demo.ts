// Realistiske demodata: ca. 300 sager over 12 måneder, alle fire sagstyper,
// blandede statusser, løbende salærfakturering og enkelte kreditnotaer.
// Deterministisk (seedet), så tallene er stabile mellem genstarter samme dag.

import { addDays, isWeekend, setHours, setMinutes, startOfDay, subMonths } from 'date-fns';
import type { Omsaetningspost, Sag, Sagstype } from '../../shared/types.js';
import type { SagsData } from '../kpi/dashboard.js';
import type { CaseSource, RevenueSource } from './types.js';

/** Mulberry32 — lille, hurtig, deterministisk PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TypeProfil {
  andel: number;
  /** Median behandlingstid i dage og spredning (log-normal). */
  medianDage: number;
  spredning: number;
  salaer: [number, number];
  aabneStatusser: string[];
  /** Antal salærfakturaer pr. sag (fx a conto / afdrag). */
  fakturaer: [number, number];
}

const PROFILER: Record<Sagstype, TypeProfil> = {
  InkassoUdenAktiver: {
    andel: 0.42,
    medianDage: 45,
    spredning: 0.8,
    salaer: [600, 4500],
    aabneStatusser: ['Ny', 'Rykker sendt', 'Under behandling', 'Afdragsordning', 'Retslig inkasso'],
    fakturaer: [1, 4],
  },
  InkassoMedAktiver: {
    andel: 0.3,
    medianDage: 70,
    spredning: 0.7,
    salaer: [3000, 22000],
    aabneStatusser: ['Ny', 'Under behandling', 'Afdragsordning', 'Udlæg', 'Retslig inkasso'],
    fakturaer: [2, 6],
  },
  Detektiv: {
    andel: 0.17,
    medianDage: 21,
    spredning: 0.6,
    salaer: [8000, 55000],
    aabneStatusser: ['Ny', 'Efterforskning', 'Overvågning', 'Rapportering'],
    fakturaer: [1, 3],
  },
  Konkurs: {
    andel: 0.11,
    medianDage: 140,
    spredning: 0.5,
    salaer: [15000, 110000],
    aabneStatusser: ['Ny', 'Anmeldelse', 'Under behandling', 'Afventer skifteret'],
    fakturaer: [2, 5],
  },
};

const TYPER = Object.keys(PROFILER) as Sagstype[];

function arbejdstid(dag: Date, r: () => number): Date {
  return setMinutes(setHours(dag, 8 + Math.floor(r() * 9)), Math.floor(r() * 60));
}

function naesteHverdag(d: Date): Date {
  let x = d;
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}

export interface Demodata {
  sager: Sag[];
  poster: Omsaetningspost[];
}

export function genererDemodata(nu: Date, antal = 300, seed = 20261007): Demodata {
  const r = prng(seed);
  const rand = (min: number, max: number) => min + r() * (max - min);
  const normal = () => {
    // Box–Muller
    const u = Math.max(r(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };

  const start = subMonths(startOfDay(nu), 12);
  const spanDage = Math.round((nu.getTime() - start.getTime()) / 86400000);
  const sager: Sag[] = [];
  const poster: Omsaetningspost[] = [];

  for (let i = 0; i < antal; i++) {
    // Sagstype efter andel
    let x = r();
    let type: Sagstype = TYPER[0];
    for (const t of TYPER) {
      if ((x -= PROFILER[t].andel) <= 0) {
        type = t;
        break;
      }
    }
    const p = PROFILER[type];

    // Lidt flere sager i nyere tid (vækst), kun hverdage
    const dagIndex = Math.floor(Math.pow(r(), 0.85) * spanDage);
    const oprettet = arbejdstid(naesteHverdag(addDays(start, dagIndex)), r);
    if (oprettet > nu) continue;

    // Log-normal behandlingstid; ~4 % lukkes samme dag (fx betalt straks)
    const dage = r() < 0.04 ? 0 : Math.max(0, Math.round(p.medianDage * Math.exp(p.spredning * normal())));
    const lukDag = dage === 0 ? oprettet : arbejdstid(naesteHverdag(addDays(startOfDay(oprettet), dage)), r);
    const lukket = lukDag <= nu && lukDag >= oprettet ? lukDag : null;

    const salaer = Math.round(rand(p.salaer[0], p.salaer[1]) / 50) * 50;
    const status = lukket
      ? r() < 0.06
        ? 'Annulleret'
        : 'Lukket'
      : p.aabneStatusser[Math.floor(r() * p.aabneStatusser.length)];

    sager.push({
      id: `demo-${i}`,
      type,
      status,
      oprettet,
      lukket,
      // ~15 % mangler forventet salær → pipeline bruger fallback
      forventetSalaer: r() < 0.15 ? null : salaer,
    });

    if (status === 'Annulleret') continue;

    // Salærfakturaer fordelt over sagens levetid (afdrag/a conto) — kun hverdage
    const slut = lukket ?? nu;
    const levetid = Math.max(0, (slut.getTime() - oprettet.getTime()) / 86400000);
    const antalFakt = lukket
      ? Math.floor(rand(p.fakturaer[0], p.fakturaer[1] + 1))
      : Math.floor(rand(0, p.fakturaer[1])); // åbne sager har kun delvist faktureret
    const realiseringsgrad = lukket ? rand(0.6, 1.15) : rand(0.1, 0.5);
    for (let f = 0; f < antalFakt; f++) {
      const offset = antalFakt === 1 ? levetid : (levetid * (f + 1)) / antalFakt;
      const dato = startOfDay(naesteHverdag(addDays(oprettet, Math.round(offset))));
      if (dato > nu) continue;
      const beloeb = Math.round(((salaer * realiseringsgrad) / antalFakt) * 100) / 100;
      poster.push({ dato, beloebEksMoms: beloeb, sagstype: type });
      // ~3 % krediteres helt eller delvist
      if (r() < 0.03) {
        const kDato = startOfDay(naesteHverdag(addDays(dato, Math.floor(rand(1, 20)))));
        if (kDato <= nu) {
          poster.push({ dato: kDato, beloebEksMoms: -Math.round(beloeb * rand(0.3, 1) * 100) / 100, sagstype: type });
        }
      }
    }
  }

  // Løbende småposter (fx rykkergebyrer/salær fra masseinkasso) så "I dag" ikke er tom.
  for (let dag = start; dag <= nu; dag = addDays(dag, 1)) {
    if (isWeekend(dag)) continue;
    const n = Math.floor(rand(2, 9));
    for (let j = 0; j < n; j++) {
      const type: Sagstype = r() < 0.75 ? 'InkassoUdenAktiver' : 'InkassoMedAktiver';
      poster.push({ dato: startOfDay(dag), beloebEksMoms: Math.round(rand(100, 1200)), sagstype: type });
    }
  }

  return { sager, poster };
}

/** Demo-kilde for både sager og omsætning. Data genereres én gang pr. kalenderdag. */
export class DemoSource implements CaseSource, RevenueSource {
  readonly navn = 'Demodata';
  private cache: { dag: string; data: Demodata } | null = null;

  private data(): Demodata {
    const nu = new Date();
    const dag = nu.toDateString();
    if (!this.cache || this.cache.dag !== dag) this.cache = { dag, data: genererDemodata(nu) };
    return this.cache.data;
  }

  async getCaseData(): Promise<SagsData> {
    // Filtrér på nu, så sager "lukket senere i dag" ikke vises før tid.
    const nu = new Date();
    return { art: 'sager', sager: this.data().sager.filter((s) => s.oprettet <= nu) };
  }

  async getRevenueEntries(fra: Date, til: Date): Promise<Omsaetningspost[]> {
    return this.data().poster.filter((p) => p.dato >= fra && p.dato < til);
  }
}
