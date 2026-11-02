import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { EventSub, type ChatEvent } from '../eventsub.js';
import type { Twitch } from '../twitch.js';

async function waitFor(predicate: () => boolean) {
  const end = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('EventSub test timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
test('EventSub subscribes on welcome, deduplicates chat, carries reconnect subscriptions and resubscribes after drops', async t => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [], calls: { path: string; body: unknown }[] = [], received: ChatEvent[] = [], states: string[] = [];
  const mock = { broadcasterId: '123', identify: async () => {}, api: async (path: string, _method: string, body: unknown) => { calls.push({ path, body }); } } as unknown as Twitch;
  const packet = (socket: WebSocket, type: string, payload: unknown, id: string = randomUUID()) => socket.send(JSON.stringify({ metadata: { message_id: id, message_type: type, message_timestamp: new Date().toISOString() }, payload }));
  server.on('connection', socket => {
    sockets.push(socket);
    packet(socket, 'session_welcome', { session: { id: `session-${sockets.length}`, keepalive_timeout_seconds: 10 } });
  });
  const client = new EventSub(mock, async event => { received.push(event); }, state => states.push(state), () => new WebSocket(`ws://127.0.0.1:${port}`));
  t.after(async () => { client.stop(); for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); });
  await client.start(); await waitFor(() => states.includes('connected'));
  assert.deepEqual(calls[0].body, { non_moderator_chat_delay: true, non_moderator_chat_delay_duration: 6 });
  const subscriptions = () => calls.filter(call => call.path === 'eventsub/subscriptions');
  assert.equal(subscriptions().length, 1);
  assert.deepEqual((subscriptions()[0].body as { condition: object }).condition, { broadcaster_user_id: '123', user_id: '123' });
  const notification = { subscription: { type: 'channel.chat.message' }, event: { message_id: 'm1', message: { text: 'hello' } } };
  packet(sockets[0], 'notification', notification, 'duplicate'); packet(sockets[0], 'notification', notification, 'duplicate');
  packet(sockets[0], 'session_keepalive', {});
  await waitFor(() => received.length === 1);
  packet(sockets[0], 'session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=1' } });
  await waitFor(() => sockets.length === 2 && sockets[0].readyState === WebSocket.CLOSED);
  assert.equal(subscriptions().length, 1);
  sockets[1].terminate(); await waitFor(() => sockets.length === 3 && subscriptions().length === 2);
  assert(states.includes('reconnecting_gap'));
  packet(sockets[2], 'revocation', { subscription: { status: 'authorization_revoked' } });
  await waitFor(() => client.state === 'revoked:authorization_revoked');
});

test('failed reconnect handoff triggers recovery when replacement closes before welcome', async t => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [], states: string[] = [];
  const mock = { broadcasterId: '123', identify: async () => {}, api: async () => {} } as unknown as Twitch;
  const packet = (socket: WebSocket, type: string, payload: unknown, id: string = randomUUID()) =>
    socket.send(JSON.stringify({ metadata: { message_id: id, message_type: type, message_timestamp: new Date().toISOString() }, payload }));

  server.on('connection', socket => {
    sockets.push(socket);
    if (sockets.length !== 2) {
      packet(socket, 'session_welcome', { session: { id: `session-${sockets.length}`, keepalive_timeout_seconds: 10 } });
    }
  });

  const client = new EventSub(mock, async () => {}, state => states.push(state), () => new WebSocket(`ws://127.0.0.1:${port}`));
  t.after(async () => {
    client.stop();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  await client.start();
  await waitFor(() => states.includes('connected'));

  packet(sockets[0], 'session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=1' } });
  await waitFor(() => sockets.length === 2);

  sockets[1].terminate();

  await waitFor(() => states.includes('reconnecting_gap'));
  await waitFor(() => sockets.length === 3);
});

test('pending startup is cancelled by stop() and concurrent starts do not create duplicate sessions', async t => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [], states: string[] = [];

  let resolveIdentify: () => void = () => {};
  const mock = {
    broadcasterId: '123',
    identify: () => new Promise<void>(resolve => { resolveIdentify = resolve; }),
    api: async () => {},
  } as unknown as Twitch;

  server.on('connection', socket => {
    sockets.push(socket);
  });

  const client = new EventSub(mock, async () => {}, state => states.push(state), () => new WebSocket(`ws://127.0.0.1:${port}`));
  t.after(async () => {
    client.stop();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const startPromise = client.start();
  client.stop();
  resolveIdentify();
  await startPromise;

  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sockets.length, 0);
  assert.equal(client.state, 'disconnected');

  const quickMock = {
    broadcasterId: '123',
    identify: async () => { await new Promise(r => setTimeout(r, 20)); },
    api: async () => {},
  } as unknown as Twitch;

  const client2 = new EventSub(quickMock, async () => {}, state => states.push(state), () => new WebSocket(`ws://127.0.0.1:${port}`));
  t.after(() => client2.stop());

  await Promise.all([client2.start(), client2.start()]);
  await waitFor(() => sockets.length === 1);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sockets.length, 1);
});
