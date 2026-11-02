import express, { type ErrorRequestHandler } from 'express';
import { join } from 'node:path';
import { root } from './config.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
      res.status(403).json({ error: 'Use localhost or 127.0.0.1' }); return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${host}`) {
      res.status(403).json({ error: 'Open controls on the local server origin' }); return;
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.redirect('/dashboard/'));
  app.use('/shared', express.static(join(root, 'shared')));
  app.use('/dashboard', express.static(join(root, 'dashboard')));
  app.use('/overlay', express.static(join(root, 'overlay')));
  app.use('/game', express.static(join(root, 'game')));
  return app;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('Request failed:', error.message);
  res.status(status).json({ error: status >= 500 ? 'Request failed. Check server terminal.' : error.message });
};
