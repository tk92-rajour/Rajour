import { kr, pct } from '../../../shared/format';
import { SAGSTYPE_NAVN, type PeriodeKpi } from '../../../shared/types';

interface Props {
  kpi: PeriodeKpi;
  tv: boolean;
  periodeNavn: string;
}

/**
 * KPI 6: Omsætning fordelt på sagstyper — søjlediagram og tabel i ét:
 * hver række har en vandret søjle (længde ∝ beløb), beløb og andel i %.
 * Sagstypen står kun ét sted, så den er læsbar på afstand.
 */
export function FordelingPanel({ kpi, tv, periodeNavn }: Props) {
  const raekker = kpi.fordeling;
  const total = raekker.reduce((a, r) => a + r.beloeb, 0);
  const max = Math.max(0, ...raekker.map((r) => r.beloeb));
  const tom = raekker.every((r) => r.beloeb === 0);

  return (
    <section className="panel" aria-labelledby="fordeling-titel">
      <div className="panel-hoved">
        <h2 id="fordeling-titel">Omsætning pr. sagstype</h2>
        <span className="daempet">{periodeNavn}</span>
      </div>
      <table className="fordelingstabel tal-tabel">
        <thead>
          <tr>
            <th scope="col">Sagstype</th>
            <th scope="col" className="soejle-kol">
              <span className="skjult">Andel som søjle</span>
            </th>
            <th scope="col">Beløb</th>
            <th scope="col">Andel</th>
          </tr>
        </thead>
        <tbody>
          {raekker.map((r) => {
            const bredde = max > 0 && r.beloeb > 0 ? (r.beloeb / max) * 100 : 0;
            return (
              <tr
                key={r.type}
                className={r.type === 'Ukendt' ? 'ukendt' : undefined}
                title={tv ? undefined : `${SAGSTYPE_NAVN[r.type]}: ${kr(r.beloeb, 2)}${r.andelPct !== null ? ` (${pct(r.andelPct)})` : ''}`}
              >
                <td>{SAGSTYPE_NAVN[r.type]}</td>
                <td className="soejle-kol" aria-hidden="true">
                  <div className="soejle-spor">
                    <div className="soejle" style={{ width: `${bredde}%` }} />
                  </div>
                </td>
                <td>{kr(r.beloeb, tv ? 0 : 2)}</td>
                <td>{r.andelPct === null ? '–' : pct(r.andelPct)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>I alt</td>
            <td className="soejle-kol" />
            <td>{kr(total, tv ? 0 : 2)}</td>
            <td>{total > 0 ? pct(100, 0) : '–'}</td>
          </tr>
        </tfoot>
      </table>
      {tom && <div className="tom lille">Ingen omsætning i perioden endnu</div>}
    </section>
  );
}
