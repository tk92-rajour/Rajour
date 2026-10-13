import { existsSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Env } from './env.js';
import type { DashboardData, ManuelListe } from '../shared/types.js';
import { erPrivatIp } from './lan.js';
import type { ManuelLager } from './providers/manuel.js';
import { erGyldigDato, validerRegistrering } from './manuel/valider.js';
import { isoFraDato } from './kpi/dage.js';

export interface ManuelOpsaetning {
  lager: ManuelLager;
  /** Valgfri adgangskode til at gemme/slette. */
  kode?: string;
  /** Kaldes efter hver ændring, så dashboardet opdateres med det samme. */
  efterAendring: () => void;
}

/** Sammenligner koder uden at lække længde/indhold via svartid. */
function kodeOk(givet: unknown, forventet: string): boolean {
  if (typeof givet !== 'string') return false;
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(givet), h(forventet));
}

export function byggApp(
  env: Env,
  hentData: () => DashboardData | null,
  webDir: string,
  manuel?: ManuelOpsaetning,
): FastifyInstance {
  const app = Fastify({
    // Ingen request-logning (IP-adresser/URL'er er unødvendige og kan være persondata).
    logController: new LogController({ disableRequestLogging: true }),
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  if (env.LAN_ONLY) {
    app.addHook('onRequest', async (req, reply) => {
      if (!erPrivatIp(req.ip)) {
        return reply.code(403).send({ fejl: 'Kun tilgængelig på det interne netværk' });
      }
    });
  }

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
  });

  app.get('/api/dashboard', async (_req, reply) => {
    const data = hentData();
    reply.header('Cache-Control', 'no-store');
    if (!data) return reply.code(503).send({ fejl: 'Data er ikke klar endnu' });
    return data;
  });

  if (manuel) {
    const { lager, kode, efterAendring } = manuel;

    app.get('/api/manuel', async (_req, reply): Promise<ManuelListe> => {
      reply.header('Cache-Control', 'no-store');
      return { registreringer: await lager.alle(), kodeKraevet: !!kode };
    });

    const tjekKode = async (req: FastifyRequest, reply: FastifyReply) => {
      if (kode && !kodeOk(req.headers['x-indtast-kode'], kode)) {
        return reply.code(401).send({ fejl: 'Forkert eller manglende kode' });
      }
    };

    app.put<{ Params: { dato: string } }>('/api/manuel/:dato', { preHandler: tjekKode }, async (req, reply) => {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
      if (!body) return reply.code(400).send({ fejl: 'Ugyldige data' });
      const v = validerRegistrering({ ...body, dato: req.params.dato }, isoFraDato(new Date()));
      if (!v.ok) return reply.code(422).send({ fejl: 'Tjek de markerede felter', felter: v.fejl });
      const gemt = await lager.gemRegistrering(v.vaerdi);
      req.log.info({ dato: gemt.dato }, 'Dagstal gemt');
      efterAendring();
      return { registrering: gemt };
    });

    app.delete<{ Params: { dato: string } }>('/api/manuel/:dato', { preHandler: tjekKode }, async (req, reply) => {
      if (!erGyldigDato(req.params.dato)) return reply.code(400).send({ fejl: 'Ugyldig dato' });
      if (!(await lager.slet(req.params.dato))) return reply.code(404).send({ fejl: 'Ingen tal for den dato' });
      req.log.info({ dato: req.params.dato }, 'Dagstal slettet');
      efterAendring();
      return reply.code(204).send();
    });
  }

  app.get('/api/health', async () => {
    const d = hentData();
    return { ok: !!d, beregnet: d?.beregnet ?? null, kilder: d?.kilder ?? [] };
  });

  if (existsSync(path.join(webDir, 'index.html'))) {
    app.register(fastifyStatic, {
      root: webDir,
      index: 'index.html',
      setHeaders(reply, filePath) {
        // Filnavne i /assets har hash → kan caches længe. index.html må aldrig caches.
        reply.header(
          'Cache-Control',
          filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ fejl: 'Ikke fundet' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.log.warn(`Frontend ikke bygget (${webDir}) — kør "npm run build"`);
  }

  return app;
}
