// CaseSystemProvider — læser sager fra det interne sagssystem (READ-ONLY).
//
// AFVENTER: databasetype, skema og godkendt feltmapping. Se docs/MANGLER-I-SAGSSYSTEMET.md.
//
// Anbefalet opsætning (kræver jeres OK — intet ændres i sagssystemet uden):
//   CREATE VIEW rapport_sager AS
//     SELECT intern_id      AS id,
//            sagstype       AS type,           -- en af de fire sagstyper
//            status,
//            oprettet_dato  AS oprettet,
//            lukket_dato    AS lukket,          -- NULL hvis åben
//            forventet_salaer                   -- kr. ekskl. moms, NULL hvis ukendt
//     FROM ...;
//   + en databasebruger med kun SELECT på rapport_sager.
//
// Når mapping er godkendt, implementeres getCases() som én SELECT mod viewet
// via den relevante driver (pg / mysql2 / mssql), og resultatet mappes til `Sag`.
// Kun de ovenstående kolonner hentes — aldrig navne, CPR eller andre persondata.

import type { Sag } from '../../shared/types.js';
import type { CaseSource } from './types.js';

export class CaseSystemSource implements CaseSource {
  readonly navn = 'Sagssystem';

  constructor(private readonly dsn: string | undefined) {}

  async getCases(): Promise<Sag[]> {
    if (!this.dsn) throw new Error('CASE_DB_URL er ikke sat i .env');
    throw new Error('Sagssystem-forbindelsen er ikke implementeret endnu — afventer godkendt feltmapping');
  }
}
