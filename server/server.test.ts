import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kpiConfig } from '../config/kpi.config.js';
import { SAGSTYPER, type Omsaetningspost, type Sag } from '../shared/types.js';
import { laesEnv } from './env.js';
import { erPrivatIp } from './lan.js';
import { Opdatering, omsaetningsVindue } from './opdatering.js';
import { genererDemodata } from './providers/demo.js';
import { EconomicSource } from './providers/economic.js';
import type { DataProvider } from './providers/types.js';

const stille = { info() {}, warn() {} };

describe('demodata', () => {
  const nu = new Date('2026-10-07T14:00:00');
  const { sager, poster } = genererDemodata(nu);

  it('ca. 300 sager over 12 måneder med alle fire sagstyper og blandede statusser', () => {
    expect(sager.length).toBeGreaterThan(280);
    expect(sager.length).toBeLessThanOrEqual(300);
    for (const t of SAGSTYPER) expect(sager.some((s) => s.type === t)).toBe(true);
    expect(new Set(sager.map((s) => s.status)).size).toBeGreaterThan(5);
    expect(sager.some((s) => s.lukket === null)).toBe(true);
    expect(sager.every((s) => s.oprettet <= nu && (s.lukket === null || s.lukket >= s.oprettet))).toBe(true);
  });

  it('indeholder kreditnotaer og ingen fremtidige poster', () => {
    expect(poster.some((p) => p.beloebEksMoms < 0)).toBe(true);
    expect(poster.every((p) => p.dato <= nu)).toBe(true);
  });

  it('er deterministisk', () => {
    expect(genererDemodata(nu).sager.length).toBe(sager.length);
  });
});

describe('LAN-filter', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.16.1.1', '172.31.255.1', '192.168.1.20', '::1', '::ffff:192.168.0.9', 'fd12:3456::1', 'fe80::1'])(
    '%s er privat',
    (ip) => expect(erPrivatIp(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '193.168.1.1', '2001:db8::1', '::ffff:8.8.8.8'])('%s er offentlig', (ip) =>
    expect(erPrivatIp(ip)).toBe(false),
  );
});

describe('env', () => {
  it('standardværdier', () => {
    const e = laesEnv({});
    expect(e.CASE_SOURCE).toBe('demo');
    expect(e.REFRESH_SECONDS).toBe(180);
    expect(e.LAN_ONLY).toBe(true);
  });
  it('afviser ugyldige værdier', () => {
    expect(() => laesEnv({ CASE_SOURCE: 'prod' })).toThrow(/CASE_SOURCE/);
    expect(() => laesEnv({ REFRESH_SECONDS: '5' })).toThrow(/REFRESH_SECONDS/);
  });
});

describe('opdatering', () => {
  const env = { ...laesEnv({}), CACHE_DIR: mkdtempSync(path.join(tmpdir(), 'kpi-')) };
  const sag: Sag = {
    id: '1',
    type: 'Detektiv',
    status: 'Ny',
    oprettet: new Date('2026-10-01T10:00:00'),
    lukket: null,
    forventetSalaer: 1000,
  };
  const post: Omsaetningspost = { dato: new Date('2026-10-06T00:00:00'), beloebEksMoms: 500, sagstype: 'Detektiv' };

  it('beholder sidst kendte data og markerer kilden som nede ved fejl', async () => {
    let fejl = false;
    const provider: DataProvider = {
      demo: false,
      sager: { navn: 'Test', getCases: async () => (fejl ? Promise.reject(new Error('timeout')) : [sag]) },
      omsaetning: { navn: 'Test', getRevenueEntries: async () => [post] },
    };
    const o = new Opdatering(provider, kpiConfig, env, stille);
    await o.koer(new Date('2026-10-07T14:00:00'));
    expect(o.hent()?.aabneSager).toBe(1);

    fejl = true;
    await o.koer(new Date('2026-10-07T14:03:00'));
    const d = o.hent()!;
    expect(d.aabneSager).toBe(1);
    expect(d.perioder.uge.omsaetning.nu).toBe(500);
    expect(d.kilder[0]).toMatchObject({ ok: false, fejl: 'timeout' });
    expect(d.kilder[1].ok).toBe(true);
  });

  it('svaret indeholder ingen sags-id\'er eller persondata', async () => {
    const provider: DataProvider = {
      demo: false,
      sager: { navn: 'Test', getCases: async () => [{ ...sag, id: 'HEMMELIG-SAG-123' }] },
      omsaetning: { navn: 'Test', getRevenueEntries: async () => [post] },
    };
    const o = new Opdatering(provider, kpiConfig, env, stille);
    await o.koer(new Date('2026-10-07T14:00:00'));
    expect(JSON.stringify(o.hent())).not.toContain('HEMMELIG');
  });

  it('henter omsætning nok til trend og forrige måned', () => {
    const v = omsaetningsVindue(new Date('2026-10-07T14:00:00'), 12);
    expect(v.fra).toEqual(new Date('2026-07-13T00:00:00'));
    expect(v.til).toEqual(new Date('2026-10-08T00:00:00'));
  });
});

describe('e-conomic', () => {
  const mapping = { ...kpiConfig.economic, salaerVarenumre: ['SAL'], salaerVaregrupper: [] };

  function fakeFetch(routes: Record<string, unknown>, kald: string[] = []) {
    return (async (input: string | URL) => {
      const u = new URL(String(input));
      kald.push(u.pathname);
      const body = routes[u.pathname];
      if (body === undefined) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
  }

  const routes = {
    '/invoices/booked': {
      collection: [
        { bookedInvoiceNumber: 1, date: '2026-10-05' },
        { bookedInvoiceNumber: 2, date: '2026-10-06' },
      ],
      pagination: {},
    },
    '/invoices/booked/1': {
      bookedInvoiceNumber: 1,
      date: '2026-10-05',
      lines: [
        { product: { productNumber: 'SAL' }, totalNetAmount: 1500 },
        { product: { productNumber: 'HOVEDSTOL' }, totalNetAmount: 20000 },
      ],
    },
    '/invoices/booked/2': {
      bookedInvoiceNumber: 2,
      date: '2026-10-06',
      lines: [{ product: { productNumber: 'SAL' }, totalNetAmount: -500 }],
    },
  };

  it('tæller kun salærlinjer, kreditnota trækkes fra, og fakturaer hentes kun én gang', async () => {
    const kald: string[] = [];
    const src = new EconomicSource({
      appSecretToken: 'x',
      agreementGrantToken: 'y',
      mapping,
      omsaetningsgrundlag: 'fakturadato',
      fetchImpl: fakeFetch(routes, kald),
    });
    const fra = new Date('2026-10-01T00:00:00');
    const til = new Date('2026-10-08T00:00:00');
    const r = await src.getRevenueEntries(fra, til);
    expect(r.map((p) => p.beloebEksMoms)).toEqual([1500, -500]);
    expect(r[0].dato).toEqual(new Date('2026-10-05T00:00:00'));

    await src.getRevenueEntries(fra, til);
    expect(kald.filter((k) => k === '/invoices/booked/1')).toHaveLength(1);
  });

  it('nægter at køre uden godkendt salær-mapping', () => {
    expect(
      () =>
        new EconomicSource({
          appSecretToken: 'x',
          agreementGrantToken: 'y',
          mapping: kpiConfig.economic,
          omsaetningsgrundlag: 'fakturadato',
        }),
    ).toThrow(/Afventer godkendt mapping/);
  });
});
