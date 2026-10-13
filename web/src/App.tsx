import { useEffect, useState } from 'react';
import { getISOWeek, isSameDay } from 'date-fns';
import { beloebStort, dage, dato, datoKort, kr, tal, ugedag } from '../../shared/format';
import { FORRIGE_PERIODE_NAVN, PERIODE_NAVN, PERIODER, type DashboardData, type Periode } from '../../shared/types';
import { Delta, KortSkelet, KpiKort } from './components/KpiKort';
import { FordelingPanel } from './components/FordelingPanel';
import { TrendPanel } from './components/TrendPanel';
import { Statuslinje } from './components/Statuslinje';
import { laesLager, skrivLager, useDashboard, useNu } from './hooks';

const params = new URLSearchParams(location.search);
export const TV = params.get('mode') === 'tv';

interface Etiketter {
  navn: Record<Periode, string>;
  forrige: Record<Periode, string>;
  uge: string;
}

const stort = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const maanedFormat = new Intl.DateTimeFormat('da-DK', { month: 'long' });

/**
 * Periodenavne. Ved manuel indtastning slutter tallene typisk i går — så står der fx
 * "Man. 12. okt." / "Uge 42" / "Oktober" i stedet for "I dag", så ingen misforstår dem.
 */
function etiketter(data: DashboardData | null, nu: Date): Etiketter {
  const ref = data ? new Date(data.referencetid ?? data.beregnet) : nu;
  if (!data?.manuel || isSameDay(ref, nu)) {
    return { navn: PERIODE_NAVN, forrige: FORRIGE_PERIODE_NAVN, uge: 'denne uge' };
  }
  return {
    navn: {
      dag: `${stort(ugedag(ref).slice(0, 3))}. ${datoKort(ref)}`,
      uge: `Uge ${getISOWeek(ref)}`,
      maaned: stort(maanedFormat.format(ref)),
    },
    forrige: { dag: 'dagen før', uge: 'ugen før', maaned: 'måneden før' },
    uge: `uge ${getISOWeek(ref)}`,
  };
}

function erPeriode(v: string | null): v is Periode {
  return v !== null && (PERIODER as string[]).includes(v);
}

/** Følger OS-temaet, så grafernes farver gentegnes ved skift (laptop). */
function useTema(): string {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const [moerk, setMoerk] = useState(mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const f = (e: MediaQueryListEvent) => setMoerk(e.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [mq]);
  return TV ? 'tv' : moerk ? 'moerk' : 'lys';
}

/** Valgt periode. Laptop: toggle (huskes). Tv: roterer automatisk, hvis slået til. */
function usePeriode(data: DashboardData | null): [Periode, (p: Periode) => void, number] {
  const fraUrl = params.get('periode');
  const [periode, setPeriode] = useState<Periode>(() => {
    if (erPeriode(fraUrl)) return fraUrl;
    if (TV) return 'dag';
    const gemt = laesLager('kpi.periode');
    return erPeriode(gemt) ? gemt : 'uge';
  });

  const rotParam = params.get('rotation');
  const rotationSek = TV ? (rotParam !== null ? Math.max(0, Number(rotParam) || 0) : (data?.visning.tvRotationSek ?? 0)) : 0;

  useEffect(() => {
    if (!rotationSek) return;
    const t = setInterval(() => {
      setPeriode((p) => PERIODER[(PERIODER.indexOf(p) + 1) % PERIODER.length]);
    }, rotationSek * 1000);
    return () => clearInterval(t);
  }, [rotationSek]);

  const vaelg = (p: Periode) => {
    setPeriode(p);
    skrivLager('kpi.periode', p);
  };
  return [periode, vaelg, rotationSek];
}

export function App() {
  const { data, fejl, indlaeser } = useDashboard();
  const nu = useNu(TV ? 20 : 30);
  const tema = useTema();
  const [periode, setPeriode, rotationSek] = usePeriode(data);
  const et = etiketter(data, nu);

  // Esc forlader tv-visning (ingen klik påkrævet på storskærmen).
  useEffect(() => {
    if (!TV) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') location.search = '';
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);

  return (
    <main className="side">
      <header className="top">
        <div className="titel">
          <h1>Nøgletal</h1>
          <div className="undertitel">
            {ugedag(nu).replace(/^./, (c) => c.toUpperCase())} {dato(nu)} · uge {getISOWeek(nu)}
          </div>
        </div>
        <div className="handlinger">
          {TV ? (
            <TvPerioder periode={periode} rotationSek={rotationSek} navn={et.navn} />
          ) : (
            <>
              <div className="toggle" role="group" aria-label="Vælg periode">
                {PERIODER.map((p) => (
                  <button key={p} type="button" aria-pressed={p === periode} onClick={() => setPeriode(p)}>
                    {et.navn[p]}
                  </button>
                ))}
              </div>
              {data?.manuel && (
                <a className="knap primaer" href="/indtast">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Indtast tal
                </a>
              )}
              <a className="knap" href="?mode=tv" title="Mørk storskærmsvisning til kontorets skærm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="13" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                Storskærm
              </a>
            </>
          )}
        </div>
      </header>

      {data ? (
        <>
          {!TV && <Statuslinje data={data} hentFejl={fejl} nu={nu} />}
          <Indhold data={data} periode={periode} tema={tema} et={et} />
          {TV && <Statuslinje data={data} hentFejl={fejl} nu={nu} />}
        </>
      ) : indlaeser ? (
        <>
          <div className="kort-raekke">
            {Array.from({ length: 5 }, (_, i) => (
              <KortSkelet key={i} />
            ))}
          </div>
          <span className="skjult">Indlæser nøgletal…</span>
        </>
      ) : (
        <div className="fuld-besked" role="alert">
          <h2>Nøgletallene kan ikke vises lige nu</h2>
          <p>{fejl}. Siden prøver automatisk igen.</p>
        </div>
      )}
    </main>
  );
}

function Indhold({ data, periode, tema, et }: { data: DashboardData; periode: Periode; tema: string; et: Etiketter }) {
  const p = data.perioder[periode];
  const forrige = et.forrige[periode];
  const bt = p.behandlingstid;
  const lu = data.lukketDenneUge;
  const pl = data.pipeline;
  const grundlag = data.visning.omsaetningsgrundlag === 'fakturadato' ? 'faktureret' : 'indbetalt';

  return (
    <>
      <div className="kort-raekke">
        <KpiKort
          etiket="Åbne sager"
          vaerdi={tal(data.aabneSager)}
          detalje={<span className="daempet">Alle sager, der ikke er lukket</span>}
          forklaring="Antal sager med en status, der ikke er lukket."
        />
        <KpiKort
          etiket={`Lukket ${et.uge}`}
          vaerdi={tal(lu.nu)}
          detalje={<Delta antal={lu.nu - lu.forrige} sammenlignetMed={`ugen før (${tal(lu.forrige)})`} />}
          forklaring="Sager lukket mandag–søndag i indeværende ISO-uge, sammenlignet med samme tidspunkt forrige uge."
        />
        <KpiKort
          etiket="Pipeline"
          vaerdi={beloebStort(pl.beloeb)}
          enhed="kr."
          detalje={
            <span className="daempet">
              Forventet salær i {tal(pl.antalSager)} åbne sager
              {pl.antalMedFallback > 0 && !TV ? ` (${tal(pl.antalMedFallback)} estimeret)` : ''}
            </span>
          }
          forklaring={`Sum af forventet salær på åbne sager: ${kr(pl.beloeb, 2)}. ${tal(pl.antalMedFallback)} sager uden forventet salær er estimeret ud fra sagstype.`}
        />
        <KpiKort
          etiket="Omsætning"
          periode={et.navn[periode]}
          vaerdi={beloebStort(p.omsaetning.nu)}
          enhed="kr."
          detalje={<Delta pct={p.omsaetning.aendringPct} sammenlignetMed={forrige} />}
          forklaring={`${kr(p.omsaetning.nu, 2)} i salær ${grundlag} ekskl. moms, krediteringer fratrukket. ${stort(forrige)}: ${kr(p.omsaetning.forrige, 2)}.`}
        />
        <KpiKort
          etiket="Behandlingstid"
          periode={et.navn[periode]}
          vaerdi={bt.gennemsnitDage === null ? '–' : tal(bt.gennemsnitDage, bt.gennemsnitDage < 10 ? 1 : 0)}
          enhed={bt.gennemsnitDage === null ? undefined : 'dage gns.'}
          detalje={
            bt.antal === 0 ? (
              <span className="daempet">Ingen sager lukket i perioden</span>
            ) : (
              <span className="daempet">
                Median {dage(bt.medianDage ?? 0)} · {tal(bt.antal)} {bt.antal === 1 ? 'sag' : 'sager'}
              </span>
            )
          }
          forklaring="Dage fra oprettelse til lukning for sager lukket i perioden. Medianen påvirkes ikke af enkelte meget lange sager."
        />
      </div>
      <div className="graf-raekke">
        <FordelingPanel kpi={p} tv={TV} periodeNavn={et.navn[periode]} />
        <TrendPanel uger={data.omsaetningPrUge} tv={TV} tema={tema} />
      </div>
    </>
  );
}

function TvPerioder({ periode, rotationSek, navn }: { periode: Periode; rotationSek: number; navn: Record<Periode, string> }) {
  return (
    <div className="tv-perioder" aria-label={`Viser ${navn[periode]}`}>
      {PERIODER.map((p) => (
        <span key={p} className={p === periode ? 'aktiv' : undefined}>
          {navn[p]}
          {p === periode && rotationSek > 0 && (
            <span
              className="fremdrift"
              style={{ width: '100%', animation: `fyld ${rotationSek}s linear forwards` }}
            />
          )}
        </span>
      ))}
    </div>
  );
}
