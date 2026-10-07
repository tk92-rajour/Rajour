import { describe, expect, it } from 'vitest';
import type { Omsaetningspost, Sag } from '../../shared/types.js';
import { kpiConfig, type KpiConfig } from '../../config/kpi.config.js';
import { aktuelPeriode, aktuelPeriodeTilDato, forrigePeriode, senesteUger } from './perioder.js';
import { aabneSager, behandlingstid, erLukket, forventetSalaer, lukketDenneUge, pipeline } from './sager.js';
import { fordelingPaaSagstype, omsaetningIInterval, omsaetningPrUge, realiseretOmsaetning } from './omsaetning.js';
import { gennemsnit, median, sammenlign } from './statistik.js';
import { beregnDashboard } from './dashboard.js';

// Lokal tid (TZ=Europe/Copenhagen sættes i vitest.config.ts).
const d = (s: string) => new Date(s);

const cfg: KpiConfig = {
  ...kpiConfig,
  lukkedeStatusser: ['Lukket'],
  sammenligning: 'til-dato',
  pipelineFallback: {
    InkassoMedAktiver: { sandsynlighed: 0.5, forventetIndtaegt: 10000 },
    InkassoUdenAktiver: { sandsynlighed: 0.2, forventetIndtaegt: 1000 },
    Detektiv: { sandsynlighed: 1, forventetIndtaegt: 20000 },
    Konkurs: { sandsynlighed: 0.5, forventetIndtaegt: 40000 },
  },
};

let n = 0;
function sag(p: Partial<Omit<Sag, 'oprettet' | 'lukket'>> & { oprettet: string; lukket?: string | null }): Sag {
  return {
    id: `t${n++}`,
    type: p.type ?? 'InkassoUdenAktiver',
    status: p.status ?? (p.lukket ? 'Lukket' : 'Under behandling'),
    oprettet: d(p.oprettet),
    lukket: p.lukket ? d(p.lukket) : null,
    forventetSalaer: p.forventetSalaer ?? null,
  };
}

function post(dato: string, beloeb: number, type: Omsaetningspost['sagstype'] = 'InkassoUdenAktiver'): Omsaetningspost {
  return { dato: d(dato), beloebEksMoms: beloeb, sagstype: type };
}

// Onsdag 7. okt. 2026 kl. 14:00 — ISO-uge 41 (man 5. okt. – søn 11. okt.)
const NU = d('2026-10-07T14:00:00');

describe('perioder', () => {
  it('ISO-uge starter mandag og slutter søndag', () => {
    const iv = aktuelPeriode('uge', NU);
    expect(iv.fra).toEqual(d('2026-10-05T00:00:00'));
    expect(iv.til).toEqual(d('2026-10-12T00:00:00'));
  });

  it('søndag hører til ugen før (ikke amerikansk uge)', () => {
    const iv = aktuelPeriode('uge', d('2026-10-11T23:59:00'));
    expect(iv.fra).toEqual(d('2026-10-05T00:00:00'));
  });

  it('forrige periode til dato: samme tidspunkt i forrige uge', () => {
    const iv = forrigePeriode('uge', NU, 'til-dato');
    expect(iv.fra).toEqual(d('2026-09-28T00:00:00'));
    expect(iv.til).toEqual(d('2026-09-30T14:00:00'));
  });

  it('forrige periode hel: hele forrige måned', () => {
    const iv = forrigePeriode('maaned', NU, 'hel-periode');
    expect(iv.fra).toEqual(d('2026-09-01T00:00:00'));
    expect(iv.til).toEqual(d('2026-10-01T00:00:00'));
  });

  it('31. marts sammenlignes med til og med 28. feb. — aldrig ind i marts', () => {
    const iv = forrigePeriode('maaned', d('2027-03-31T10:00:00'), 'til-dato');
    expect(iv.fra).toEqual(d('2027-02-01T00:00:00'));
    expect(iv.til).toEqual(d('2027-02-28T10:00:00'));
  });

  it('forrige dag = i går til samme klokkeslæt', () => {
    const iv = forrigePeriode('dag', NU, 'til-dato');
    expect(iv.fra).toEqual(d('2026-10-06T00:00:00'));
    expect(iv.til).toEqual(d('2026-10-06T14:00:00'));
  });

  it('håndterer sommertid-skift (25. okt. 2026 har 25 timer)', () => {
    const iv = aktuelPeriode('dag', d('2026-10-25T12:00:00'));
    expect(iv.til.getTime() - iv.fra.getTime()).toBe(25 * 3600 * 1000);
  });

  it('ugenummer ved årsskifte: 1. jan. 2027 (fredag) er uge 53 i 2026', () => {
    const uger = senesteUger(d('2027-01-01T12:00:00'), 2);
    expect(uger.map((u) => `${u.aar}-${u.uge}`)).toEqual(['2026-52', '2026-53']);
  });
});

describe('statistik', () => {
  it('median ved lige og ulige antal', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('gennemsnit af tom liste er null', () => {
    expect(gennemsnit([])).toBeNull();
  });
  it('procentændring er null når forrige er 0 eller negativ', () => {
    expect(sammenlign(100, 0).aendringPct).toBeNull();
    expect(sammenlign(100, -50).aendringPct).toBeNull();
    expect(sammenlign(150, 100).aendringPct).toBe(50);
    expect(sammenlign(0, 100).aendringPct).toBe(-100);
  });
});

describe('KPI 1: åbne sager', () => {
  it('ingen sager → 0', () => {
    expect(aabneSager([], NU, cfg.lukkedeStatusser)).toHaveLength(0);
  });
  it('tæller sager med status ≠ lukket; store/små bogstaver ignoreres', () => {
    const sager = [
      sag({ oprettet: '2026-09-01T09:00:00' }),
      sag({ oprettet: '2026-09-01T09:00:00', status: 'Afdragsordning' }),
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-09-20T09:00:00' }),
      sag({ oprettet: '2026-09-01T09:00:00', status: 'LUKKET' }),
    ];
    expect(aabneSager(sager, NU, cfg.lukkedeStatusser)).toHaveLength(2);
    expect(erLukket(sager[3], cfg.lukkedeStatusser)).toBe(true);
  });
  it('fremtidigt oprettede sager tælles ikke', () => {
    expect(aabneSager([sag({ oprettet: '2026-10-08T09:00:00' })], NU, cfg.lukkedeStatusser)).toHaveLength(0);
  });
});

describe('KPI 2: lukket i indeværende uge', () => {
  it('tæller kun lukninger man–nu, og sammenligner med samme tid forrige uge', () => {
    const sager = [
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-10-05T00:00:00' }), // mandag 00:00 — med
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-10-07T13:59:00' }), // med
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-10-04T23:59:59' }), // søndag før — forrige uge
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-09-29T10:00:00' }), // forrige uge, før samme tid
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-09-28T08:00:00' }), // forrige uge, før samme tid
    ];
    const r = lukketDenneUge(sager, NU, cfg);
    expect(r.nu).toBe(2);
    expect(r.forrige).toBe(2); // søndag 4/10 ligger efter ons. 30/9 kl. 14 → ikke med i "til dato"
    expect(lukketDenneUge(sager, NU, { ...cfg, sammenligning: 'hel-periode' }).forrige).toBe(3);
  });
  it('sag med lukket status men uden lukkedato tælles ikke som lukket i ugen', () => {
    const s = sag({ oprettet: '2026-10-05T09:00:00', status: 'Lukket' });
    expect(lukketDenneUge([s], NU, cfg).nu).toBe(0);
  });
  it('genåbnet sag (lukkedato sat, men status åben) tælles ikke som lukket', () => {
    const s = sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-10-06T09:00:00', status: 'Genoptaget' });
    expect(lukketDenneUge([s], NU, cfg).nu).toBe(0);
  });
});

describe('KPI 3: pipeline', () => {
  it('bruger forventet salær når det findes, ellers fallback pr. sagstype', () => {
    const sager = [
      sag({ oprettet: '2026-09-01T09:00:00', forventetSalaer: 1234.5 }),
      sag({ oprettet: '2026-09-01T09:00:00', type: 'Detektiv' }), // 1 × 20000
      sag({ oprettet: '2026-09-01T09:00:00', type: 'InkassoMedAktiver' }), // 0,5 × 10000
      sag({ oprettet: '2026-09-01T09:00:00', lukket: '2026-09-10T09:00:00', forventetSalaer: 99999 }), // lukket
    ];
    expect(pipeline(sager, NU, cfg)).toEqual({ beloeb: 26234.5, antalSager: 3, antalMedFallback: 2 });
  });
  it('forventet salær 0 er en gyldig værdi (ikke fallback)', () => {
    expect(forventetSalaer(sag({ oprettet: '2026-09-01', forventetSalaer: 0 }), cfg.pipelineFallback)).toEqual({
      beloeb: 0,
      fallback: false,
    });
  });
  it('ingen sager → 0 kr. og 0 sager', () => {
    expect(pipeline([], NU, cfg)).toEqual({ beloeb: 0, antalSager: 0, antalMedFallback: 0 });
  });
});

describe('KPI 4: realiseret omsætning', () => {
  const poster = [
    post('2026-10-07T00:00:00', 1000),
    post('2026-10-05T00:00:00', 500.25),
    post('2026-10-06T00:00:00', -200), // kreditnota
    post('2026-10-01T00:00:00', 300), // denne måned; forrige uge, men torsdag (efter "til dato"-grænsen)
    post('2026-09-30T00:00:00', 700), // forrige uge (onsdag), forrige måned
    post('2026-10-08T00:00:00', 9999), // fremtidig — tæller ikke
  ];

  it('dag/uge/måned til dato, kreditnotaer trækkes fra', () => {
    expect(omsaetningIInterval(poster, aktuelPeriodeTilDato('dag', NU))).toBe(1000);
    expect(omsaetningIInterval(poster, aktuelPeriodeTilDato('uge', NU))).toBe(1300.25);
    expect(omsaetningIInterval(poster, aktuelPeriodeTilDato('maaned', NU))).toBe(1600.25);
  });

  it('sammenligning med forrige uge', () => {
    const r = realiseretOmsaetning(poster, aktuelPeriodeTilDato('uge', NU), forrigePeriode('uge', NU, 'til-dato'));
    expect(r.forrige).toBe(700);
    expect(r.aendringPct).toBeCloseTo(85.75);
  });

  it('periode med kun kreditnotaer giver negativ omsætning', () => {
    const iv = aktuelPeriodeTilDato('dag', d('2026-10-06T12:00:00'));
    expect(omsaetningIInterval(poster, iv)).toBe(-200);
  });

  it('øre afrundes korrekt (0,1 + 0,2)', () => {
    expect(omsaetningIInterval([post('2026-10-07', 0.1), post('2026-10-07', 0.2)], aktuelPeriodeTilDato('dag', NU))).toBe(
      0.3,
    );
  });

  it('månedsskifte: 30. sep. tæller i september, ikke oktober', () => {
    const okt = omsaetningIInterval([post('2026-09-30T23:59:00', 100)], aktuelPeriodeTilDato('maaned', NU));
    expect(okt).toBe(0);
  });
});

describe('KPI 5: behandlingstid', () => {
  it('gennemsnit og median i kalenderdage; samme dag = 0 dage', () => {
    const sager = [
      sag({ oprettet: '2026-10-06T16:00:00', lukket: '2026-10-06T16:30:00' }), // 0
      sag({ oprettet: '2026-10-05T23:50:00', lukket: '2026-10-06T00:10:00' }), // 1 (over midnat)
      sag({ oprettet: '2026-09-28T09:00:00', lukket: '2026-10-05T09:00:00' }), // 7 (over ugeskifte)
      sag({ oprettet: '2025-10-07T09:00:00', lukket: '2026-10-07T09:00:00' }), // 365
    ];
    const r = behandlingstid(sager, aktuelPeriodeTilDato('uge', NU), cfg.lukkedeStatusser);
    expect(r.antal).toBe(4);
    expect(r.gennemsnitDage).toBeCloseTo(93.25);
    expect(r.medianDage).toBe(4);
  });
  it('kun sager lukket i perioden — oprettelse uden for perioden er ok', () => {
    const sager = [
      sag({ oprettet: '2026-08-01T09:00:00', lukket: '2026-10-01T09:00:00' }), // lukket i måneden, ikke ugen
    ];
    expect(behandlingstid(sager, aktuelPeriodeTilDato('uge', NU), cfg.lukkedeStatusser).antal).toBe(0);
    expect(behandlingstid(sager, aktuelPeriodeTilDato('maaned', NU), cfg.lukkedeStatusser).antal).toBe(1);
  });
  it('ingen lukkede sager → null (ikke 0)', () => {
    expect(behandlingstid([], aktuelPeriodeTilDato('dag', NU), cfg.lukkedeStatusser)).toEqual({
      antal: 0,
      gennemsnitDage: null,
      medianDage: null,
    });
  });
  it('datafejl: lukket før oprettet udelades', () => {
    const s = sag({ oprettet: '2026-10-07T10:00:00', lukket: '2026-10-06T10:00:00' });
    expect(behandlingstid([s], aktuelPeriodeTilDato('uge', NU), cfg.lukkedeStatusser).antal).toBe(0);
  });
});

describe('KPI 6: fordeling på sagstype', () => {
  const iv = aktuelPeriodeTilDato('maaned', NU);

  it('alle fire sagstyper med, andele summer til 100 %', () => {
    const r = fordelingPaaSagstype(
      [post('2026-10-02', 750, 'Detektiv'), post('2026-10-03', 250, 'Konkurs'), post('2026-10-04', -0, 'Konkurs')],
      iv,
    );
    expect(r.map((x) => x.type)).toEqual(['InkassoMedAktiver', 'InkassoUdenAktiver', 'Detektiv', 'Konkurs']);
    expect(r.find((x) => x.type === 'Detektiv')?.andelPct).toBe(75);
    expect(r.reduce((a, x) => a + (x.andelPct ?? 0), 0)).toBeCloseTo(100);
  });

  it('kreditnota trækkes fra den rigtige sagstype', () => {
    const r = fordelingPaaSagstype([post('2026-10-02', 1000, 'Konkurs'), post('2026-10-03', -400, 'Konkurs')], iv);
    expect(r.find((x) => x.type === 'Konkurs')?.beloeb).toBe(600);
  });

  it('ukendt sagstype vises separat', () => {
    const r = fordelingPaaSagstype([post('2026-10-02', 100, 'Ukendt')], iv);
    expect(r.at(-1)).toEqual({ type: 'Ukendt', beloeb: 100, andelPct: 100 });
  });

  it('ingen omsætning eller negativ total → andel er null', () => {
    expect(fordelingPaaSagstype([], iv).every((x) => x.beloeb === 0 && x.andelPct === null)).toBe(true);
    expect(fordelingPaaSagstype([post('2026-10-02', -100, 'Detektiv')], iv).every((x) => x.andelPct === null)).toBe(true);
  });
});

describe('trend og samlet beregning', () => {
  it('omsætning pr. uge: 12 uger, sidste er igangværende', () => {
    const r = omsaetningPrUge([post('2026-10-06', 100), post('2026-09-29', 50)], NU, 12);
    expect(r).toHaveLength(12);
    expect(r.at(-1)).toMatchObject({ uge: 41, beloeb: 100, igangvaerende: true });
    expect(r.at(-2)).toMatchObject({ uge: 40, beloeb: 50, igangvaerende: false });
  });

  it('tomme data giver nuller, ikke fejl', () => {
    const r = beregnDashboard([], [], NU, cfg);
    expect(r.aabneSager).toBe(0);
    expect(r.perioder.maaned.omsaetning).toEqual({ nu: 0, forrige: 0, aendringPct: null });
    expect(r.perioder.uge.behandlingstid.gennemsnitDage).toBeNull();
  });
});
