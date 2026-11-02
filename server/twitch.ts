import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Express, RequestHandler } from 'express';
import { config, root } from './config.js';

export const scopes = ['user:read:chat', 'user:write:chat',
  'moderator:manage:chat_messages', 'moderator:manage:chat_settings', 'clips:edit'];
const redirectUri = 'http://localhost:3000/auth/callback';
interface Tokens { access_token: string; refresh_token: string; expiresAt: number }
interface User { id: string; login: string }
export const route = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
};

export class Twitch {
  private tokens?: Tokens;
  private refreshing?: Promise<void>;
  private file: string;
  broadcasterId = '';
  userId = '';

  constructor(dataDir = join(root, '.data')) {
    this.file = join(dataDir, 'twitch-tokens.json');
    if (existsSync(this.file)) {
      this.tokens = JSON.parse(readFileSync(this.file, 'utf8'));
      chmodSync(this.file, 0o600);
    }
  }
  get connected() { return !!this.tokens && !!this.broadcasterId; }
  get hasTokens() { return !!this.tokens; }
  private save(body: { access_token: string; refresh_token?: string; expires_in: number }) {
    if (!body.access_token || !(body.expires_in > 0)) throw new Error('Invalid token response');
    const refresh_token = body.refresh_token || this.tokens?.refresh_token;
    if (!refresh_token) throw new Error('No refresh token');
    this.tokens = { access_token: body.access_token, refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000 };
    mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.tokens), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  private async tokenRequest(fields: Record<string, string>) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST', signal: AbortSignal.timeout(5000),
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
    });
    if (!res.ok) throw new Error(`Twitch token request failed (${res.status}). Reconnect at /auth/login.`);
    this.save(await res.json() as Parameters<Twitch['save']>[0]);
  }
  async refresh(force = false) {
    if (!this.tokens) throw new Error('Connect Twitch at /auth/login first');
    if (!force && this.tokens.expiresAt > Date.now() + 60_000) return;
    this.refreshing ??= this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token })
      .finally(() => { this.refreshing = undefined; });
    await this.refreshing;
  }
  async api<T = { data: unknown[] }>(path: string, method = 'GET', body?: unknown, retry = true): Promise<T> {
    await this.refresh();
    const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
      method, signal: AbortSignal.timeout(1800),
      headers: { 'Client-Id': config.clientId, Authorization: `Bearer ${this.tokens!.access_token}`,
        'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && retry) {
      await this.refresh(true);
      return this.api<T>(path, method, body, false);
    }
    if (!res.ok) throw new Error(`Twitch ${method} ${path.split('?')[0]} failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  async createClip() {
    const result = await this.api<{ data: { id: string; edit_url: string }[] }>(
      `clips?${new URLSearchParams({ broadcaster_id: this.broadcasterId, has_delay: 'true' })}`, 'POST');
    if (!result.data[0]) throw new Error('Twitch returned no clip');
    return result.data[0];
  }
  async identify(retry = true): Promise<void> {
    await this.refresh();
    const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${this.tokens!.access_token}` }, signal: AbortSignal.timeout(5000),
    });
    if (validation.status === 401 && retry) { await this.refresh(true); return this.identify(false); }
    if (!validation.ok) throw new Error('Twitch token validation failed');
    const valid = await validation.json() as { client_id: string; scopes: string[] };
    if (valid.client_id !== config.clientId || scopes.some(scope => !valid.scopes.includes(scope))) {
      throw new Error('Twitch app or scopes changed. Reconnect at /auth/login.');
    }
    const me = (await this.api<{ data: User[] }>('users')).data[0];
    const channel = config.channel ? (await this.api<{ data: User[] }>(`users?login=${encodeURIComponent(config.channel)}`)).data[0] : me;
    if (!me || !channel || me.id !== channel.id) throw new Error('Sign in as the owner of TWITCH_CHANNEL');
    this.userId = me.id;
    this.broadcasterId = channel.id;
  }
  mountAuth(app: Express, onConnect: () => Promise<void> = async () => {}) {
    const states = new Map<string, number>();
    app.get('/auth/login', (req, res) => {
      if (!config.clientId || !config.clientSecret) {
        res.status(503).send('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env first.'); return;
      }
      for (const [key, expiry] of states) if (expiry < Date.now()) states.delete(key);
      if (states.size >= 100) { res.status(429).send('Too many login attempts. Try again later.'); return; }
      const state = randomBytes(32).toString('hex');
      states.set(state, Date.now() + 600_000);
      res.cookie('sv_oauth', state, { httpOnly: true, sameSite: 'lax', maxAge: 600_000, path: '/auth' });
      res.redirect(`https://id.twitch.tv/oauth2/authorize?${new URLSearchParams({
        client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '), state,
      })}`);
    });
    app.get('/auth/callback', route(async (req, res) => {
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const cookie = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('sv_oauth='))?.slice(9);
      const expiry = states.get(state) || 0;
      states.delete(state);
      res.clearCookie('sv_oauth', { path: '/auth' });
      if (!state || cookie !== state || expiry < Date.now()) {
        res.status(400).send('Invalid or expired OAuth state. Start again at /auth/login.'); return;
      }
      if (typeof req.query.code !== 'string' || req.query.error) {
        res.status(400).send('Twitch authorization was declined.'); return;
      }
      await this.tokenRequest({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: redirectUri });
      await this.identify();
      await onConnect();
      res.redirect('/dashboard/');
    }));
  }
}
