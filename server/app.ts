import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Env } from './env.js';
import type { DashboardData } from '../shared/types.js';
import { erPrivatIp } from './lan.js';

export function byggApp(env: Env, hentData: () => DashboardData | null, webDir: string): FastifyInstance {
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
