import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { dato as fmtDato, datoKort, forrigeHverdag, isoDato as iso, kr, parseTal, tal, ugedag } from '../../shared/format';
import { SAGSTYPER, SAGSTYPE_NAVN, type Dagsregistrering, type ManuelListe, type Sagstype } from '../../shared/types';

// ---------- datohjælpere (lokal tid) ----------

function fraIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function hverdageTilbage(antal: number, nu = new Date()): string[] {
  const ud: string[] = [];
  const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 1);
  while (ud.length < antal) {
    if (d.getDay() !== 0 && d.getDay() !== 6) ud.push(iso(d));
    d.setDate(d.getDate() - 1);
  }
  return ud;
}

function langDato(s: string): string {
  const d = fraIso(s);
  return `${ugedag(d)} ${fmtDato(d)}`;
}

function kortDato(s: string): string {
  const d = fraIso(s);
  return `${ugedag(d).slice(0, 3)}. ${datoKort(d)}`;
}

/** Tal → tekst til et inputfelt ("880.000", "1.234,50"). */
function tilFelt(n: number | null): string {
  if (n === null) return '';
  return tal(n, Number.isInteger(n) ? 0 : 2);
}

// ---------- formular ----------

interface Felter {
  aabneSager: string;
  pipeline: string;
  lukkedeSager: string;
  behandlingsdage: string;
  omsaetning: Record<Sagstype, string>;
}

const tomOmsaetning = (): Record<Sagstype, string> =>
  Object.fromEntries(SAGSTYPER.map((t) => [t, ''])) as Record<Sagstype, string>;

function felterFra(r: Dagsregistrering | null, forudfyld: Dagsregistrering | null): Felter {
  if (r) {
    return {
      aabneSager: tilFelt(r.aabneSager),
      pipeline: tilFelt(r.pipeline),
      lukkedeSager: String(r.lukkedeSager),
      behandlingsdage: r.behandlingsdage.join(', '),
      omsaetning: Object.fromEntries(SAGSTYPER.map((t) => [t, r.omsaetning[t] ? tilFelt(r.omsaetning[t]) : ''])) as Record<
        Sagstype,
        string
      >,
    };
  }
  return {
    // Åbne sager og pipeline ændrer sig langsomt — forudfyld fra seneste dag.
    aabneSager: tilFelt(forudfyld?.aabneSager ?? null),
    pipeline: tilFelt(forudfyld?.pipeline ?? null),
    lukkedeSager: '',
    behandlingsdage: '',
    omsaetning: tomOmsaetning(),
  };
}

type Fejl = Record<string, string>;

/** Læser formularen til det format, API'et forventer. Returnerer feltfejl, hvis noget ikke kan læses. */
function laesFelter(f: Felter): { data: Omit<Dagsregistrering, 'dato'> } | { fejl: Fejl } {
  const fejl: Fejl = {};
  const heltal = (navn: string, s: string, paakraevet: boolean): number | null => {
    const v = parseTal(s);
    if (v === null) {
      if (paakraevet) return 0;
      return null;
    }
    if (!Number.isInteger(v) || v < 0) fejl[navn] = 'Skriv et helt tal, fx 12';
    return v;
  };
  const beloeb = (navn: string, s: string): number | null => {
    const v = parseTal(s);
    if (v !== null && Number.isNaN(v)) fejl[navn] = 'Skriv et beløb, fx 12.500,00';
    return v;
  };

  const aabneSager = heltal('aabneSager', f.aabneSager, false);
  const pipeline = beloeb('pipeline', f.pipeline);
  if (pipeline !== null && pipeline < 0) fejl.pipeline = 'Pipeline kan ikke være negativ';
  const lukkedeSager = heltal('lukkedeSager', f.lukkedeSager, true) ?? 0;

  const dele = f.behandlingsdage
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const behandlingsdage = dele.map((x) => Number(x));
  if (behandlingsdage.some((x) => !Number.isInteger(x) || x < 0)) {
    fejl.behandlingsdage = 'Skriv hele dage adskilt af komma, fx 12, 45, 3';
  } else if (behandlingsdage.length > 0 && behandlingsdage.length !== lukkedeSager) {
    fejl.behandlingsdage = `Du har skrevet ${behandlingsdage.length} behandlingstider, men ${lukkedeSager} lukkede sager`;
  }

  const omsaetning = {} as Record<Sagstype, number>;
  for (const t of SAGSTYPER) omsaetning[t] = beloeb(`omsaetning.${t}`, f.omsaetning[t]) ?? 0;

  if (Object.keys(fejl).length > 0) return { fejl };
  return { data: { aabneSager, pipeline, lukkedeSager, behandlingsdage, omsaetning } };
}

// ---------- API ----------

const KODE_NOEGLE = 'kpi.indtastKode';

function hentKode(): string {
  try {
    return sessionStorage.getItem(KODE_NOEGLE) ?? '';
  } catch {
    return '';
  }
}

function gemKode(k: string) {
  try {
    sessionStorage.setItem(KODE_NOEGLE, k);
  } catch {
    /* ignorer */
  }
}

async function kald(metode: 'PUT' | 'DELETE', dato: string, kode: string, body?: unknown) {
  const res = await fetch(`/api/manuel/${dato}`, {
    method: metode,
    headers: { 'Content-Type': 'application/json', ...(kode ? { 'X-Indtast-Kode': kode } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
}

// ---------- komponent ----------

type Besked = { type: 'ok' | 'fejl'; tekst: string } | null;

export function Indtastning() {
  const [liste, setListe] = useState<ManuelListe | null>(null);
  const [indlaesFejl, setIndlaesFejl] = useState<string | null>(null);
  const [dato, setDato] = useState(forrigeHverdag());
  const [felter, setFelter] = useState<Felter>(() => felterFra(null, null));
  const [fejl, setFejl] = useState<Fejl>({});
  const [besked, setBesked] = useState<Besked>(null);
  const [gemmer, setGemmer] = useState(false);
  const [kode, setKode] = useState(hentKode);

  const idag = iso(new Date());
  const regs = liste?.registreringer ?? [];
  const eksisterende = regs.find((r) => r.dato === dato) ?? null;
  const forrige = useMemo(() => [...regs].reverse().find((r) => r.dato < dato) ?? null, [regs, dato]);

  const indlaes = useCallback(async () => {
    try {
      const res = await fetch('/api/manuel', { cache: 'no-store' });
      if (res.status === 404) throw new Error('Manuel indtastning er ikke slået til på serveren (CASE_SOURCE=manuel i .env)');
      if (!res.ok) throw new Error(`Serveren svarede ${res.status}`);
      setListe((await res.json()) as ManuelListe);
      setIndlaesFejl(null);
    } catch (e) {
      setIndlaesFejl(e instanceof Error ? e.message : 'Kunne ikke hente data');
    }
  }, []);

  useEffect(() => {
    document.title = 'Indtast tal – Nøgletal';
    void indlaes();
  }, [indlaes]);

  // Ryd en gammel kvittering, når der vælges en anden dato.
  useEffect(() => setBesked(null), [dato]);

  // Udfyld formularen, når dato vælges eller listen er hentet.
  useEffect(() => {
    if (!liste) return;
    setFelter(felterFra(eksisterende, forrige));
    setFejl({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dato, liste]);

  const saetFelt = (navn: keyof Omit<Felter, 'omsaetning'>, v: string) => setFelter((f) => ({ ...f, [navn]: v }));
  const saetOms = (t: Sagstype, v: string) => setFelter((f) => ({ ...f, omsaetning: { ...f.omsaetning, [t]: v } }));

  const omsSum = SAGSTYPER.reduce((a, t) => {
    const v = parseTal(felter.omsaetning[t]);
    return a + (v !== null && !Number.isNaN(v) ? v : 0);
  }, 0);

  async function gem(e: FormEvent) {
    e.preventDefault();
    setBesked(null);
    if (dato > idag) {
      setFejl({ dato: 'Datoen må ikke ligge i fremtiden' });
      return;
    }
    const l = laesFelter(felter);
    if ('fejl' in l) {
      setFejl(l.fejl);
      setBesked({ type: 'fejl', tekst: 'Tjek de markerede felter' });
      return;
    }
    setGemmer(true);
    try {
      const r = await kald('PUT', dato, kode, l.data);
      if (r.status === 401) setBesked({ type: 'fejl', tekst: 'Forkert eller manglende kode' });
      else if (r.status === 422) {
        setFejl(r.json?.felter ?? {});
        setBesked({ type: 'fejl', tekst: 'Tjek de markerede felter' });
      } else if (r.status !== 200) setBesked({ type: 'fejl', tekst: `Kunne ikke gemme (fejl ${r.status})` });
      else {
        setFejl({});
        setBesked({ type: 'ok', tekst: `Gemt for ${langDato(dato)}. Dashboardet er opdateret.` });
        if (kode) gemKode(kode);
        await indlaes();
      }
    } catch {
      setBesked({ type: 'fejl', tekst: 'Ingen forbindelse til serveren — tallene er ikke gemt' });
    } finally {
      setGemmer(false);
    }
  }

  async function slet(d: string) {
    if (!confirm(`Slet tallene for ${langDato(d)}?`)) return;
    const r = await kald('DELETE', d, kode).catch(() => null);
    if (!r || (r.status !== 204 && r.status !== 404)) {
      setBesked({ type: 'fejl', tekst: r?.status === 401 ? 'Forkert eller manglende kode' : 'Kunne ikke slette' });
      return;
    }
    setBesked({ type: 'ok', tekst: `Tallene for ${langDato(d)} er slettet` });
    await indlaes();
  }

  const mangler = useMemo(() => {
    const har = new Set(regs.map((r) => r.dato));
    const foerste = regs[0]?.dato;
    return hverdageTilbage(15).filter((d) => !har.has(d) && (!foerste || d >= foerste));
  }, [regs]);

  const fejlVed = (navn: string) =>
    fejl[navn] ? (
      <span className="felt-fejl" id={`${navn}-fejl`}>
        {fejl[navn]}
      </span>
    ) : null;
  const aria = (navn: string) => ({ 'aria-invalid': !!fejl[navn], 'aria-describedby': fejl[navn] ? `${navn}-fejl` : undefined });

  return (
    <main className="side indtast">
      <header className="top">
        <div className="titel">
          <h1>Indtast dagens tal</h1>
          <div className="undertitel">Tallene vises på dashboardet, så snart du gemmer</div>
        </div>
        <a className="knap" href="/">
          ← Til dashboardet
        </a>
      </header>

      {indlaesFejl && (
        <div className="advarsel" role="alert">
          {indlaesFejl}
        </div>
      )}

      {liste && (
        <div className="indtast-gitter">
          <form className="panel formular" onSubmit={gem} noValidate>
            <div className="felt-raekke">
              <label className="felt">
                <span className="felt-navn">Tallene gælder for</span>
                <input type="date" value={dato} max={idag} onChange={(e) => e.target.value && setDato(e.target.value)} {...aria('dato')} />
                <span className="felt-hjaelp">
                  {langDato(dato).replace(/^./, (c) => c.toUpperCase())}
                  {eksisterende ? ' · der er allerede tal for denne dag – du retter dem' : ''}
                </span>
                {fejlVed('dato')}
              </label>
              {liste.kodeKraevet && (
                <label className="felt">
                  <span className="felt-navn">Kode</span>
                  <input type="password" value={kode} onChange={(e) => setKode(e.target.value)} autoComplete="current-password" />
                  <span className="felt-hjaelp">Huskes, indtil browseren lukkes</span>
                </label>
              )}
            </div>

            <fieldset>
              <legend>Sager</legend>
              <div className="felt-raekke">
                <label className="felt">
                  <span className="felt-navn">Åbne sager ved dagens slutning</span>
                  <input inputMode="numeric" value={felter.aabneSager} onChange={(e) => saetFelt('aabneSager', e.target.value)} {...aria('aabneSager')} />
                  {!eksisterende && forrige?.aabneSager != null && (
                    <span className="felt-hjaelp">Forudfyldt fra {kortDato(forrige.dato)} – ret, hvis det har ændret sig</span>
                  )}
                  {fejlVed('aabneSager')}
                </label>
                <label className="felt">
                  <span className="felt-navn">Pipeline – forventet salær i åbne sager</span>
                  <span className="med-enhed">
                    <input inputMode="decimal" value={felter.pipeline} onChange={(e) => saetFelt('pipeline', e.target.value)} {...aria('pipeline')} />
                    <span>kr.</span>
                  </span>
                  {fejlVed('pipeline')}
                </label>
              </div>
              <div className="felt-raekke">
                <label className="felt">
                  <span className="felt-navn">Sager lukket denne dag</span>
                  <input inputMode="numeric" placeholder="0" value={felter.lukkedeSager} onChange={(e) => saetFelt('lukkedeSager', e.target.value)} {...aria('lukkedeSager')} />
                  {fejlVed('lukkedeSager')}
                </label>
                <label className="felt">
                  <span className="felt-navn">
                    Behandlingstid for hver lukket sag <span className="valgfri">(valgfri)</span>
                  </span>
                  <input
                    placeholder="fx 12, 45, 3"
                    value={felter.behandlingsdage}
                    onChange={(e) => saetFelt('behandlingsdage', e.target.value)}
                    {...aria('behandlingsdage')}
                  />
                  <span className="felt-hjaelp">Antal dage fra oprettelse til lukning – én værdi pr. lukket sag</span>
                  {fejlVed('behandlingsdage')}
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Omsætning – faktureret salær denne dag</legend>
              <p className="felt-hjaelp blok">
                Ekskl. moms. Kun salær/honorar – ikke hovedstol, der går videre til klienten. Kreditnota: skriv minus, fx −1.500.
              </p>
              <div className="felt-raekke fire">
                {SAGSTYPER.map((t) => (
                  <label className="felt" key={t}>
                    <span className="felt-navn">{SAGSTYPE_NAVN[t]}</span>
                    <span className="med-enhed">
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={felter.omsaetning[t]}
                        onChange={(e) => saetOms(t, e.target.value)}
                        {...aria(`omsaetning.${t}`)}
                      />
                      <span>kr.</span>
                    </span>
                    {fejlVed(`omsaetning.${t}`)}
                  </label>
                ))}
              </div>
              <div className="sum">
                I alt <strong className="tal-tabel">{kr(omsSum, 2)}</strong>
              </div>
            </fieldset>

            <div className="formular-bund">
              <button type="submit" className="knap primaer" disabled={gemmer}>
                {gemmer ? 'Gemmer…' : eksisterende ? 'Gem ændringer' : 'Gem tal'}
              </button>
              {besked && (
                <span className={besked.type === 'ok' ? 'besked ok' : 'besked fejl'} role="status">
                  {besked.type === 'ok' ? '✓ ' : ''}
                  {besked.tekst}
                </span>
              )}
            </div>
          </form>

          <section className="panel historik" aria-labelledby="historik-titel">
            <div className="panel-hoved">
              <h2 id="historik-titel">Seneste indtastninger</h2>
              <span className="daempet">
                {tal(regs.length)} {regs.length === 1 ? 'dag' : 'dage'} i alt
              </span>
            </div>
            {mangler.length > 0 && (
              <div className="mangler">
                <span className="felt-hjaelp">Hverdage uden tal:</span>
                {mangler.slice(0, 8).map((d) => (
                  <button key={d} type="button" className="chip" onClick={() => setDato(d)}>
                    {kortDato(d)}
                  </button>
                ))}
              </div>
            )}
            {regs.length === 0 ? (
              <div className="tom">Ingen tal endnu. Start med at taste tallene for {kortDato(forrigeHverdag())}.</div>
            ) : (
              <table className="fordelingstabel tal-tabel">
                <thead>
                  <tr>
                    <th scope="col">Dato</th>
                    <th scope="col">Åbne</th>
                    <th scope="col">Lukket</th>
                    <th scope="col">Omsætning</th>
                    <th scope="col">
                      <span className="skjult">Handlinger</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...regs]
                    .reverse()
                    .slice(0, 30)
                    .map((r) => (
                      <tr key={r.dato} className={r.dato === dato ? 'valgt' : undefined}>
                        <td>{kortDato(r.dato)}</td>
                        <td>{r.aabneSager === null ? '–' : tal(r.aabneSager)}</td>
                        <td>{tal(r.lukkedeSager)}</td>
                        <td>{kr(SAGSTYPER.reduce((a, t) => a + r.omsaetning[t], 0))}</td>
                        <td className="handlinger-celle">
                          <button type="button" className="link-knap" onClick={() => setDato(r.dato)}>
                            Ret
                          </button>
                          <button type="button" className="link-knap fare" onClick={() => slet(r.dato)}>
                            Slet
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
