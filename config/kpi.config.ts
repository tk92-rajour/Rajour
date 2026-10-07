// ============================================================================
//  KPI-DEFINITIONER — ét sted at justere, hvordan tallene beregnes.
//  Se docs/KPI-DEFINITIONER.md for forklaring af hvert punkt.
//  Ændringer kræver genstart af serveren.
// ============================================================================

import type { Sagstype } from '../shared/types.js';

export interface KpiConfig {
  /** Statusser i sagssystemet, der betyder at sagen er lukket. Sammenlignes uden hensyn til store/små bogstaver. */
  lukkedeStatusser: string[];

  /**
   * Hvad der tæller som lukkedato:
   *  - 'lukkedato'   : sagens eget lukkedato-felt (anbefalet).
   *  - 'sidstAendret': fallback hvis lukkedato ikke registreres (upræcist — se docs).
   */
  lukkedatoKilde: 'lukkedato' | 'sidstAendret';

  /**
   * Hvilken dato omsætning tælles på:
   *  - 'fakturadato'   : faktureret salær (standard).
   *  - 'betalingsdato' : indbetalt salær (kræver læsning af posteringer i e-conomic).
   */
  omsaetningsgrundlag: 'fakturadato' | 'betalingsdato';

  /**
   * Sammenligning med forrige periode:
   *  - 'til-dato'   : samme del af forrige periode (fx man–ons kl. 14 mod man–ons kl. 14 forrige uge). Fair midt i perioden.
   *  - 'hel-periode': hele forrige periode.
   */
  sammenligning: 'til-dato' | 'hel-periode';

  /**
   * Fallback for pipeline, når sagen ikke har forventet salær:
   * forventet salær = sandsynlighed × forventet indtægt (kr. ekskl. moms).
   * TALLENE ER PLADSHOLDERE — skal fastsættes af ledelsen.
   */
  pipelineFallback: Record<Sagstype, { sandsynlighed: number; forventetIndtaegt: number }>;

  /** e-conomic: hvordan salær genkendes på fakturalinjer (afventer godkendt mapping). */
  economic: {
    /** Varenumre der er salær/honorar. Alt andet (hovedstol, renter til klient, udlæg) ignoreres. */
    salaerVarenumre: string[];
    /** Alternativt: varegrupper (productGroupNumber) der er salær. */
    salaerVaregrupper: number[];
    /** Varegruppe → sagstype, hvis sagstype kan udledes direkte i e-conomic. */
    varegruppeTilSagstype: Record<number, Sagstype>;
    /** Hvilket felt sagsnummeret står i på fakturaen. */
    sagsreferenceFelt: 'references.other' | 'notes.heading' | 'notes.textLine1';
  };

  /** Antal uger i grafen "Omsætning pr. uge". */
  ugerITrend: number;
}

export const kpiConfig: KpiConfig = {
  lukkedeStatusser: ['Lukket', 'Afsluttet', 'Annulleret'],
  lukkedatoKilde: 'lukkedato',
  omsaetningsgrundlag: 'fakturadato',
  sammenligning: 'til-dato',

  pipelineFallback: {
    InkassoMedAktiver: { sandsynlighed: 0.7, forventetIndtaegt: 9000 },
    InkassoUdenAktiver: { sandsynlighed: 0.35, forventetIndtaegt: 2500 },
    Detektiv: { sandsynlighed: 0.9, forventetIndtaegt: 25000 },
    Konkurs: { sandsynlighed: 0.6, forventetIndtaegt: 45000 },
  },

  economic: {
    salaerVarenumre: [],
    salaerVaregrupper: [],
    varegruppeTilSagstype: {},
    sagsreferenceFelt: 'references.other',
  },

  ugerITrend: 12,
};
