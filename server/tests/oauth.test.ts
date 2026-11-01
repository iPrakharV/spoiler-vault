import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Twitch, scopes } from '../twitch.js';
import { config, root } from '../config.js';
import { createApp, errorHandler } from '../app.js';

test('OAuth rejects invalid state, checks owner, saves private tokens and refreshes once for concurrent callers', async t => {
  const oldFetch = globalThis.fetch, before = { ...config };
  t.after(() => { globalThis.fetch = oldFetch; Object.assign(config, before); });
  Object.assign(config, { clientId: 'test-client', clientSecret: 'test-secret', channel: 'owner' });
  const folder = mkdtempSync(join(root, 'work/oauth-test-'));
  const twitch = new Twitch(folder), app = createApp(); let connected = 0, refreshCalls = 0;
  twitch.mountAuth(app, async () => { connected++; }); app.use(errorHandler);
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith(base)) return oldFetch(url, init);
    if (target === 'https://id.twitch.tv/oauth2/token') {
      const fields = init!.body as URLSearchParams;
      if (fields.get('grant_type') === 'refresh_token') { refreshCalls++; await new Promise(resolve => setTimeout(resolve, 20)); }
      else assert.equal(fields.get('redirect_uri'), 'http://localhost:3000/auth/callback');
      return Response.json({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 });
    }
    if (target.endsWith('/validate')) return Response.json({ client_id: 'test-client', scopes });
    if (target.startsWith('https://api.twitch.tv/helix/users')) return Response.json({ data: [{ id: '123', login: 'owner' }] });
    throw new Error(`Unexpected fetch ${target}`);
  };
  assert.equal((await fetch(`${base}/auth/callback?state=bad&code=bad`)).status, 400);
  const login = await fetch(`${base}/auth/login`, { redirect: 'manual' }); assert.equal(login.status, 302);
  const target = new URL(login.headers.get('location')!);
  assert.equal(target.searchParams.get('scope'), scopes.join(' '));
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const callback = `${base}/auth/callback?code=fake&state=${target.searchParams.get('state')}`;
  assert.equal((await fetch(callback, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 302);
  assert.equal(connected, 1); assert.equal(twitch.broadcasterId, '123');
  assert.equal((statSync(join(folder, 'twitch-tokens.json')).mode & 0o777), 0o600);
  assert(readFileSync(join(folder, 'twitch-tokens.json'), 'utf8').includes('fake-refresh'));
  assert.equal((await fetch(callback, { headers: { Cookie: cookie } })).status, 400);
  await Promise.all([twitch.refresh(true), twitch.refresh(true)]); assert.equal(refreshCalls, 1);
});
