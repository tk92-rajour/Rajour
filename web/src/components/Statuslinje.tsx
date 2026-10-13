import { dato, forrigeHverdag, klokken, ugedag } from '../../../shared/format';
import type { DashboardData } from '../../../shared/types';

interface Props {
  data: DashboardData;
  hentFejl: string | null;
  nu: Date;
}

/** Advarsler om forældede data eller nedlagte kilder. Tom liste = alt ok. */
export function advarsler({ data, hentFejl, nu }: Props): string[] {
  const ud: string[] = [];
  const beregnet = new Date(data.beregnet);
  const minGammel = (nu.getTime() - beregnet.getTime()) / 60000;
  if (hentFejl) ud.push(`${hentFejl} – viser tal fra kl. ${klokken(beregnet)}`);
  for (const k of data.kilder) {
    if (!k.ok) {
      ud.push(
        `${k.navn} er utilgængelig${k.sidstOk ? ` – sidst hentet kl. ${klokken(k.sidstOk)}` : ''}`,
      );
    }
  }
  if (data.manuel) {
    // Tallene tastes om morgenen for i går: advar, hvis seneste hverdag mangler.
    const s = data.manuel.senesteDato;
    if (!s) ud.push('Der er ikke indtastet nogen tal endnu');
    else if (s < forrigeHverdag(nu)) {
      const d = new Date(`${s}T12:00:00`);
      ud.push(`Seneste indtastede tal er for ${ugedag(d)} ${dato(d)}`);
    }
  }
  if (!hentFejl && minGammel > data.visning.foraeldetEfterMin) {
    ud.push(`Tallene er over ${data.visning.foraeldetEfterMin} min. gamle`);
  }
  return ud;
}

export function Statuslinje(props: Props) {
  const liste = advarsler(props);
  return (
    <div className="statuslinje" role="status" aria-live="polite">
      {props.data.demo && (
        <span className="demo-maerke" title="Tallene er genererede demodata — ikke rigtige tal">
          DEMODATA
        </span>
      )}
      {liste.length > 0 ? (
        <span className="advarsel">
          <span className="prik gul" aria-hidden="true" />
          <span>{liste.join(' · ')}</span>
        </span>
      ) : (
        <span className="prik" aria-hidden="true" />
      )}
      {props.data.manuel?.senesteDato ? (
        <span>Tal til og med {senesteTekst(props.data.manuel.senesteDato)}</span>
      ) : (
        <span>Sidst opdateret kl. {klokken(props.data.beregnet)}</span>
      )}
    </div>
  );
}

function senesteTekst(s: string): string {
  const d = new Date(`${s}T12:00:00`);
  return `${ugedag(d)} ${dato(d)}`;
}
