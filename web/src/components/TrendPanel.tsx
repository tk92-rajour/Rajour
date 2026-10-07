import { datoKort, kr, krKort } from '../../../shared/format';
import type { UgeOmsaetning } from '../../../shared/types';
import { cssVar, remPx, useChart } from './useChart';

interface Props {
  uger: UgeOmsaetning[];
  tv: boolean;
  tema: string;
}

/** Realiseret omsætning pr. ISO-uge — giver kontekst til periodetallene. */
export function TrendPanel({ uger, tv, tema }: Props) {
  const tom = uger.every((u) => u.beloeb === 0);

  const canvasRef = useChart(() => {
    const fs = tv ? remPx() * 1.25 : 12;
    const accent = cssVar('--accent');
    const svag = cssVar('--accent-svag');
    const tekst = cssVar('--tekst-2');
    const gitter = cssVar('--gitter');
    return {
      type: 'bar',
      data: {
        labels: uger.map((u) => `Uge ${u.uge}`),
        datasets: [
          {
            data: uger.map((u) => u.beloeb),
            // Igangværende uge vises lysere, så den ikke læses som et fald.
            backgroundColor: uger.map((u) => (u.igangvaerende ? svag : accent)),
            borderRadius: 4,
            borderSkipped: 'start',
            barPercentage: 0.75,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: !tv,
            callbacks: {
              title: (c) => {
                const u = uger[c[0].dataIndex];
                return `Uge ${u.uge} (fra ${datoKort(u.fra)})${u.igangvaerende ? ' – igangværende' : ''}`;
              },
              label: (c) => ` ${kr(uger[c.dataIndex].beloeb, 2)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: gitter },
            title: { display: true, text: 'Uge', color: tekst, font: { size: fs * 0.9 } },
            ticks: {
              color: tekst,
              font: { size: fs },
              maxRotation: 0,
              autoSkip: false,
              callback: (_v, i) => String(uger[i].uge),
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: gitter },
            border: { display: false },
            ticks: { color: tekst, font: { size: fs * 0.9 }, maxTicksLimit: 5, callback: (v) => krKort(Number(v)) },
          },
        },
      },
    };
  }, [uger, tv, tema]);

  return (
    <section className="panel" aria-labelledby="trend-titel">
      <div className="panel-hoved">
        <h2 id="trend-titel">Omsætning pr. uge</h2>
        <span className="daempet">
          Seneste {uger.length} uger{tv ? '' : ' · sidste søjle er indeværende uge (til dato)'}
        </span>
      </div>
      <div className="graf">
        {tom ? (
          <div className="tom">Ingen omsætning registreret i perioden</div>
        ) : (
          <canvas ref={canvasRef} role="img" aria-label="Søjlediagram over omsætning pr. uge" />
        )}
      </div>
      <table className="skjult">
        <caption>Omsætning pr. uge</caption>
        <tbody>
          {uger.map((u) => (
            <tr key={`${u.aar}-${u.uge}`}>
              <th scope="row">Uge {u.uge}</th>
              <td>{kr(u.beloeb, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
