// Manuel indtastning: dagstal gemmes i én JSON-fil på serveren (data/manuel.json).
// Indeholder kun aggregerede tal — ingen persondata. Tag backup af filen (se README).

import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { Dagsregistrering, Omsaetningspost } from '../../shared/types.js';
import type { SagsData } from '../kpi/dashboard.js';
import { omsaetningFraDage, datoFraIso } from '../kpi/dage.js';
import type { CaseSource, RevenueSource } from './types.js';

interface Fil {
  version: 1;
  registreringer: Dagsregistrering[];
}

export class ManuelLager {
  private data: Map<string, Dagsregistrering> | null = null;
  /** Serialiserer skrivninger, så to samtidige gem ikke overskriver hinanden. */
  private koe: Promise<unknown> = Promise.resolve();

  constructor(readonly fil: string) {}

  private async indlaes(): Promise<Map<string, Dagsregistrering>> {
    if (this.data) return this.data;
    try {
      const f = JSON.parse(await readFile(this.fil, 'utf8')) as Fil;
      this.data = new Map(f.registreringer.map((r) => [r.dato, r]));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Beskadiget fil: stop hellere end at starte med tomme data og overskrive den.
        throw new Error(`Kan ikke læse ${path.basename(this.fil)}: ${(e as Error).message}`);
      }
      this.data = new Map();
    }
    return this.data;
  }

  private async gem(): Promise<void> {
    const data = await this.indlaes();
    const fil: Fil = { version: 1, registreringer: [...data.values()].sort((a, b) => a.dato.localeCompare(b.dato)) };
    await mkdir(path.dirname(this.fil), { recursive: true });
    // Behold forrige version som .bak, og skriv atomisk (tmp + rename).
    await copyFile(this.fil, `${this.fil}.bak`).catch(() => undefined);
    const tmp = `${this.fil}.tmp`;
    await writeFile(tmp, JSON.stringify(fil, null, 2));
    await rename(tmp, this.fil);
  }

  private serielt<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.koe.then(fn, fn);
    this.koe = p.catch(() => undefined);
    return p;
  }

  async alle(): Promise<Dagsregistrering[]> {
    return [...(await this.indlaes()).values()].sort((a, b) => a.dato.localeCompare(b.dato));
  }

  gemRegistrering(r: Dagsregistrering): Promise<Dagsregistrering> {
    return this.serielt(async () => {
      const data = await this.indlaes();
      const ny = { ...r, opdateret: new Date().toISOString() };
      data.set(r.dato, ny);
      await this.gem();
      return ny;
    });
  }

  slet(dato: string): Promise<boolean> {
    return this.serielt(async () => {
      const data = await this.indlaes();
      const fandtes = data.delete(dato);
      if (fandtes) await this.gem();
      return fandtes;
    });
  }
}

/** Datakilde for både sags-KPI'er og omsætning ud fra manuelt indtastede dagstal. */
export class ManuelSource implements CaseSource, RevenueSource {
  readonly navn = 'Manuel indtastning';

  constructor(readonly lager: ManuelLager) {}

  async getCaseData(): Promise<SagsData> {
    return { art: 'dage', dage: await this.lager.alle() };
  }

  async getRevenueEntries(fra: Date, til: Date): Promise<Omsaetningspost[]> {
    const dage = (await this.lager.alle()).filter((r) => {
      const d = datoFraIso(r.dato);
      return d >= fra && d < til;
    });
    return omsaetningFraDage(dage);
  }
}
