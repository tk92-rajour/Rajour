import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kpiConfig } from '../../config/kpi.config.js';
import type { Dagsregistrering } from '../../shared/types.js';
import { byggApp } from '../app.js';
import { laesEnv } from '../env.js';
import {
  aabneSagerFraDage,
  behandlingstidFraDage,
  lukketDenneUgeFraDage,
  omsaetningFraDage,
  pipelineFraDage,
  referencetidFraDage,
} from '../kpi/dage.js';
import { beregnDashboard } from '../kpi/dashboard.js';
import { aktuelPeriodeTilDato } from '../kpi/perioder.js';
import { Opdatering } from '../opdatering.js';
import { ManuelLager, ManuelSource } from '../providers/manuel.js';
import { validerRegistrering } from './valider.js';

const nul = { InkassoMedAktiver: 0, InkassoUdenAktiver: 0, Detektiv: 0, Konkurs: 0 };

function dag(dato: string, p: Partial<Dagsregistrering> = {}): Dagsregistrering {
  return {
    dato,
    aabneSager: null,
    pipeline: null,
    lukkedeSager: 0,
    behandlingsdage: [],
    ...p,
    omsaetning: { ...nul, ...(p.omsaetning ?? {}) },
  };
}

const tmp = () => path.join(mkdtempSync(path.join(tmpdir(), 'manuel-')), 'manuel.json');
const stille = { info() {}, warn() {} };

// Tirsdag 13. okt. 2026 kl. 08:30 — tallene for mandag 12. okt. tastes ind om morgenen.
const NU = new Date('2026-10-13T08:30:00');

const dage: Dagsregistrering[] = [
  dag('2026-10-05', { aabneSager: 120, pipeline: 900000, lukkedeSager: 2, behandlingsdage: [10, 30], omsaetning: { ...nul, Detektiv: 12000 } }),
  dag('2026-10-06', { lukkedeSager: 1, omsaetning: { ...nul, InkassoUdenAktiver: 3000, Konkurs: -500 } }),
  dag('2026-10-09', { aabneSager: 118, pipeline: 880000, lukkedeSager: 3, behandlingsdage: [] }),
  dag('2026-10-12', { aabneSager: 121, lukkedeSager: 4, behandlingsdage: [2, 4, 6, 100], omsaetning: { ...nul, InkassoMedAktiver: 8000 } }),
];

describe('KPI fra dagstal', () => {
  const ref = referencetidFraDage(dage, NU);

  it('referencetid = slutningen af seneste indtastede dag', () => {
    expect(ref).toEqual(new Date('2026-10-12T23:59:59.999'));
    expect(referencetidFraDage([], NU)).toEqual(NU);
    // Tal for i dag tæller med, men aldrig ud over "nu"
    expect(referencetidFraDage([dag('2026-10-13')], NU)).toEqual(NU);
    // Fremtidige datoer ignoreres
    expect(referencetidFraDage([dag('2026-10-20')], NU)).toEqual(NU);
  });

  it('åbne sager og pipeline: seneste angivne værdi bæres frem', () => {
    expect(aabneSagerFraDage(dage, ref)).toBe(121);
    // Pipeline ikke tastet d. 12. → værdien fra d. 9. bruges
    expect(pipelineFraDage(dage, ref)).toEqual({ beloeb: 880000, antalSager: 121, antalMedFallback: 0 });
    expect(aabneSagerFraDage([], ref)).toBe(0);
  });

  it('lukket denne uge: uge 42 (man. 12.) mod uge 41 til samme ugedag', () => {
    const r = lukketDenneUgeFraDage(dage, ref, { sammenligning: 'til-dato' });
    expect(r.nu).toBe(4);
    expect(r.forrige).toBe(2); // kun mandag 5. okt.
    expect(lukketDenneUgeFraDage(dage, ref, { sammenligning: 'hel-periode' }).forrige).toBe(6);
  });

  it('behandlingstid kun fra dage med angivne dage pr. sag', () => {
    const r = behandlingstidFraDage(dage, aktuelPeriodeTilDato('maaned', ref));
    expect(r.antal).toBe(6);
    expect(r.medianDage).toBe(8);
    expect(r.gennemsnitDage).toBeCloseTo(25.33, 2);
  });

  it('omsætning pr. sagstype bliver til poster; 0-beløb udelades, kreditnota negativ', () => {
    const p = omsaetningFraDage(dage);
    expect(p).toHaveLength(4);
    expect(p.find((x) => x.sagstype === 'Konkurs')?.beloebEksMoms).toBe(-500);
  });

  it('samlet dashboard: "I dag" = seneste indtastede dag', () => {
    const d = beregnDashboard({ art: 'dage', dage }, omsaetningFraDage(dage), ref, kpiConfig);
    expect(d.perioder.dag.omsaetning.nu).toBe(8000);
    expect(d.perioder.uge.omsaetning.nu).toBe(8000);
    expect(d.perioder.maaned.omsaetning.nu).toBe(22500);
    expect(d.aabneSager).toBe(121);
    expect(d.omsaetningPrUge.at(-1)).toMatchObject({ uge: 42, beloeb: 8000 });
  });
});

describe('validering af indtastning', () => {
  const ok = { dato: '2026-10-12', aabneSager: 10, pipeline: 1000.555, lukkedeSager: 2, behandlingsdage: [1, 2], omsaetning: { Detektiv: -50 } };

  it('accepterer gyldige tal og afrunder til øre; manglende sagstyper = 0', () => {
    const r = validerRegistrering(ok, '2026-10-13');
    expect(r.ok && r.vaerdi.pipeline).toBe(1000.56);
    expect(r.ok && r.vaerdi.omsaetning).toEqual({ ...nul, Detektiv: -50 });
  });

  it('afviser fremtidig dato, ugyldig dato, negative antal og decimaler i antal', () => {
    const r = (x: object) => validerRegistrering({ ...ok, ...x }, '2026-10-13');
    expect(r({ dato: '2026-10-14' })).toMatchObject({ ok: false, fejl: { dato: expect.stringContaining('fremtiden') } });
    expect(r({ dato: '2026-02-30' })).toMatchObject({ ok: false, fejl: { dato: 'Ugyldig dato' } });
    expect(r({ aabneSager: -1 })).toMatchObject({ ok: false, fejl: { aabneSager: expect.any(String) } });
    expect(r({ lukkedeSager: 1.5 })).toMatchObject({ ok: false });
    expect(r({ pipeline: -5 })).toMatchObject({ ok: false, fejl: { pipeline: expect.any(String) } });
    expect(r({ omsaetning: { Konkurs: 'abc' } })).toMatchObject({ ok: false, fejl: { 'omsaetning.Konkurs': expect.any(String) } });
  });

  it('antal behandlingstider skal passe med antal lukkede sager (hvis udfyldt)', () => {
    expect(validerRegistrering({ ...ok, behandlingsdage: [1] }, '2026-10-13')).toMatchObject({
      ok: false,
      fejl: { behandlingsdage: expect.stringContaining('1 behandlingstider, men 2') },
    });
    expect(validerRegistrering({ ...ok, behandlingsdage: [] }, '2026-10-13').ok).toBe(true);
  });

  it('åbne sager og pipeline må udelades (null)', () => {
    expect(validerRegistrering({ dato: '2026-10-12' }, '2026-10-13')).toMatchObject({
      ok: true,
      vaerdi: { aabneSager: null, pipeline: null, lukkedeSager: 0, behandlingsdage: [] },
    });
  });
});

describe('lager', () => {
  it('gemmer, overskriver samme dato, sletter og overlever genindlæsning', async () => {
    const fil = tmp();
    const a = new ManuelLager(fil);
    await a.gemRegistrering(dag('2026-10-09', { aabneSager: 1 }));
    await a.gemRegistrering(dag('2026-10-12', { aabneSager: 2 }));
    await a.gemRegistrering(dag('2026-10-09', { aabneSager: 3 }));
    expect((await a.alle()).map((r) => [r.dato, r.aabneSager])).toEqual([
      ['2026-10-09', 3],
      ['2026-10-12', 2],
    ]);
    expect(await a.slet('2026-10-12')).toBe(true);
    expect(await a.slet('2026-10-12')).toBe(false);

    const b = new ManuelLager(fil);
    expect((await b.alle()).map((r) => r.dato)).toEqual(['2026-10-09']);
  });

  it('samtidige gem går ikke tabt', async () => {
    const l = new ManuelLager(tmp());
    await Promise.all(['01', '02', '05', '06', '07'].map((d) => l.gemRegistrering(dag(`2026-10-${d}`))));
    expect(await l.alle()).toHaveLength(5);
  });

  it('nægter at starte på en beskadiget fil i stedet for at overskrive den', async () => {
    const fil = tmp();
    writeFileSync(fil, '{ ødelagt');
    await expect(new ManuelLager(fil).alle()).rejects.toThrow(/Kan ikke læse/);
    expect(readFileSync(fil, 'utf8')).toBe('{ ødelagt');
  });
});

describe('API /api/manuel', () => {
  function opsaet(kode?: string) {
    const lager = new ManuelLager(tmp());
    let aendringer = 0;
    const app = byggApp({ ...laesEnv({}), LAN_ONLY: false }, () => null, '/findes-ikke', {
      lager,
      kode,
      efterAendring: () => aendringer++,
    });
    return { app, lager, aendringer: () => aendringer };
  }

  const body = { aabneSager: 50, pipeline: 100000, lukkedeSager: 1, behandlingsdage: [12], omsaetning: { Detektiv: 5000 } };

  it('gemmer og henter dagstal, og opdaterer dashboardet', async () => {
    const { app, aendringer } = opsaet();
    const put = await app.inject({ method: 'PUT', url: '/api/manuel/2026-10-01', payload: body });
    expect(put.statusCode).toBe(200);
    expect(aendringer()).toBe(1);
    const get = await app.inject({ method: 'GET', url: '/api/manuel' });
    expect(get.json()).toMatchObject({ kodeKraevet: false, registreringer: [{ dato: '2026-10-01', aabneSager: 50 }] });
  });

  it('returnerer feltfejl ved ugyldige tal (422)', async () => {
    const { app } = opsaet();
    const r = await app.inject({ method: 'PUT', url: '/api/manuel/2026-10-01', payload: { ...body, lukkedeSager: -2 } });
    expect(r.statusCode).toBe(422);
    expect(r.json().felter.lukkedeSager).toBeDefined();
  });

  it('kræver kode til at gemme og slette, når INDTAST_KODE er sat', async () => {
    const { app } = opsaet('hemmelig');
    expect((await app.inject({ method: 'PUT', url: '/api/manuel/2026-10-01', payload: body })).statusCode).toBe(401);
    const forkert = await app.inject({ method: 'PUT', url: '/api/manuel/2026-10-01', payload: body, headers: { 'x-indtast-kode': 'gæt' } });
    expect(forkert.statusCode).toBe(401);
    const rigtig = await app.inject({ method: 'PUT', url: '/api/manuel/2026-10-01', payload: body, headers: { 'x-indtast-kode': 'hemmelig' } });
    expect(rigtig.statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/api/manuel/2026-10-01' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/manuel/2026-10-01', headers: { 'x-indtast-kode': 'hemmelig' } })).statusCode,
    ).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/manuel' })).json().kodeKraevet).toBe(true);
  });

  it('findes ikke, når manuel indtastning ikke er slået til', async () => {
    const app = byggApp({ ...laesEnv({}), LAN_ONLY: false }, () => null, '/findes-ikke');
    expect((await app.inject({ method: 'GET', url: '/api/manuel' })).statusCode).toBe(404);
  });
});

describe('opdatering med manuel kilde', () => {
  it('beregner "til og med" seneste indtastede dag og markerer ikke som demo', async () => {
    const lager = new ManuelLager(tmp());
    for (const r of dage) await lager.gemRegistrering(r);
    const kilde = new ManuelSource(lager);
    const o = new Opdatering(
      { sager: kilde, omsaetning: kilde, demo: false, manuel: lager },
      kpiConfig,
      { ...laesEnv({}), CACHE_DIR: path.dirname(tmp()) },
      stille,
    );
    await o.koer(NU);
    const d = o.hent()!;
    expect(d.demo).toBe(false);
    expect(new Date(d.referencetid)).toEqual(new Date('2026-10-12T23:59:59.999'));
    expect(d.manuel).toEqual({ senesteDato: '2026-10-12', antalDage: 4 });
    expect(d.aabneSager).toBe(121);
    expect(d.perioder.dag.omsaetning.nu).toBe(8000);
  });
});
