import express from 'express';
import { join } from 'node:path';
import { root } from './config.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.redirect('/dashboard/'));
  app.use('/dashboard', express.static(join(root, 'dashboard')));
  app.use('/overlay', express.static(join(root, 'overlay')));
  app.use('/game', express.static(join(root, 'game')));
  return app;
}
