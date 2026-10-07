// EconomicProvider — læser bogførte fakturaer fra Visma e-conomic REST API (READ-ONLY, kun GET).
// Dokumentation: https://restdocs.e-conomic.com
//
// STATUS: HTTP-laget (auth, paginering, rate limit, inkrementel cache) er på plads.
// Selve mappingen (hvilke linjer er salær, og hvilken sagstype) afventer godkendelse
// og konfigureres i config/kpi.config.ts → economic. Uden konfiguration nægter kilden at
// køre i stedet for at gætte.
//
// Bogførte fakturaer kan ikke ændres i e-conomic, så hver faktura hentes kun én gang
// og caches på nummer. Ved hver opdatering hentes kun listen over nye fakturaer.

import type { Omsaetningspost, Sagstype, SagstypeEllerUkendt } from '../../shared/types.js';
import type { KpiConfig } from '../../config/kpi.config.js';
import type { RevenueSource } from './types.js';

const BASE = 'https://restapi.e-conomic.com';

type Fetch = typeof fetch;

interface BookedInvoiceListItem {
  bookedInvoiceNumber: number;
  date: string; // YYYY-MM-DD
}

interface BookedInvoiceLine {
  product?: { productNumber?: string };
  totalNetAmount?: number;
  unitNetPrice?: number;
  quantity?: number;
}

interface BookedInvoice {
  bookedInvoiceNumber: number;
  date: string;
  lines?: BookedInvoiceLine[];
}

interface Product {
  productNumber: string;
  productGroup?: { productGroupNumber?: number };
}

export interface EconomicOptions {
  appSecretToken: string;
  agreementGrantToken: string;
  mapping: KpiConfig['economic'];
  omsaetningsgrundlag: KpiConfig['omsaetningsgrundlag'];
  fetchImpl?: Fetch;
  /** Maks. samtidige kald mod API'et. */
  samtidighed?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lokal midnat for en YYYY-MM-DD-dato (fakturadatoer har ingen tid). */
function lokalDato(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isoDato(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class EconomicSource implements RevenueSource {
  readonly navn = 'e-conomic';
  private readonly fetchImpl: Fetch;
  /** bookedInvoiceNumber → salærposter (fakturaer er uforanderlige efter bogføring). */
  private readonly fakturaCache = new Map<number, Omsaetningspost[]>();
  private readonly produktGruppe = new Map<string, number | null>();

  constructor(private readonly opt: EconomicOptions) {
    this.fetchImpl = opt.fetchImpl ?? fetch;
    const m = opt.mapping;
    if (m.salaerVarenumre.length === 0 && m.salaerVaregrupper.length === 0) {
      throw new Error(
        'e-conomic: ingen salær-varenumre eller -varegrupper konfigureret (config/kpi.config.ts → economic). ' +
          'Afventer godkendt mapping — kilden tæller ikke noget, frem for at gætte.',
      );
    }
    if (opt.omsaetningsgrundlag === 'betalingsdato') {
      throw new Error('e-conomic: omsætning på betalingsdato er ikke implementeret endnu (kræver læsning af posteringer)');
    }
  }

  /** GET med auth-headers, retry ved 429/5xx (respekterer Retry-After). Logger aldrig headers eller svar. */
  private async get<T>(url: string): Promise<T> {
    for (let forsoeg = 0; ; forsoeg++) {
      const res = await this.fetchImpl(url.startsWith('http') ? url : BASE + url, {
        method: 'GET',
        headers: {
          'X-AppSecretToken': this.opt.appSecretToken,
          'X-AgreementGrantToken': this.opt.agreementGrantToken,
          Accept: 'application/json',
        },
      });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && forsoeg < 4) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** forsoeg);
        continue;
      }
      throw new Error(`e-conomic svarede ${res.status} på ${new URL(url, BASE).pathname}`);
    }
  }

  private async hentListe(fra: Date, til: Date): Promise<BookedInvoiceListItem[]> {
    // Filter-syntaks: $gte / $lt, kombineret med $and:
    const filter = `date$gte:${isoDato(fra)}$and:date$lt:${isoDato(til)}`;
    let url: string | undefined = `/invoices/booked?pagesize=1000&filter=${encodeURIComponent(filter)}`;
    const alle: BookedInvoiceListItem[] = [];
    while (url) {
      const side: { collection: BookedInvoiceListItem[]; pagination?: { nextPage?: string } } = await this.get(url);
      alle.push(...side.collection);
      url = side.pagination?.nextPage;
    }
    return alle;
  }

  private async varegruppe(productNumber: string): Promise<number | null> {
    if (!this.produktGruppe.has(productNumber)) {
      const p = await this.get<Product>(`/products/${encodeURIComponent(productNumber)}`);
      this.produktGruppe.set(productNumber, p.productGroup?.productGroupNumber ?? null);
    }
    return this.produktGruppe.get(productNumber) ?? null;
  }

  /** Mapper én bogført faktura/kreditnota til salærposter. Kun salærlinjer tælles. */
  private async mapFaktura(f: BookedInvoice): Promise<Omsaetningspost[]> {
    const m = this.opt.mapping;
    const poster: Omsaetningspost[] = [];
    for (const linje of f.lines ?? []) {
      const nr = linje.product?.productNumber;
      if (!nr) continue;
      const gruppe = m.salaerVaregrupper.length > 0 || Object.keys(m.varegruppeTilSagstype).length > 0 ? await this.varegruppe(nr) : null;
      const erSalaer = m.salaerVarenumre.includes(nr) || (gruppe !== null && m.salaerVaregrupper.includes(gruppe));
      if (!erSalaer) continue;
      const beloeb = linje.totalNetAmount ?? (linje.unitNetPrice ?? 0) * (linje.quantity ?? 1);
      const sagstype: SagstypeEllerUkendt =
        gruppe !== null && m.varegruppeTilSagstype[gruppe] ? (m.varegruppeTilSagstype[gruppe] as Sagstype) : 'Ukendt';
      // Kreditnotaer har negative beløb i e-conomic og trækkes dermed fra.
      poster.push({ dato: lokalDato(f.date), beloebEksMoms: beloeb, sagstype });
    }
    return poster;
  }

  async getRevenueEntries(fra: Date, til: Date): Promise<Omsaetningspost[]> {
    const liste = await this.hentListe(fra, til);
    const nye = liste.filter((x) => !this.fakturaCache.has(x.bookedInvoiceNumber));
    const samtidighed = this.opt.samtidighed ?? 4;
    for (let i = 0; i < nye.length; i += samtidighed) {
      await Promise.all(
        nye.slice(i, i + samtidighed).map(async (x) => {
          const f = await this.get<BookedInvoice>(`/invoices/booked/${x.bookedInvoiceNumber}`);
          this.fakturaCache.set(x.bookedInvoiceNumber, await this.mapFaktura(f));
        }),
      );
    }
    return liste.flatMap((x) => this.fakturaCache.get(x.bookedInvoiceNumber) ?? []);
  }
}
