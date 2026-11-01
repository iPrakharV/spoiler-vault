import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Broadcast } from './types.js';

export function createHub(server: Server, snapshot: () => object[]) {
  const hub = new WebSocketServer({ server, path: '/ws', maxPayload: 1024,
    verifyClient: ({ req }: { req: IncomingMessage }) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}`,
  });
  const roles = new WeakMap<WebSocket, boolean>();
  hub.on('connection', (socket, req) => {
    roles.set(socket, new URL(req.url!, 'http://localhost').searchParams.get('role') === 'dashboard');
    socket.on('error', () => socket.terminate());
    for (const event of snapshot()) socket.send(JSON.stringify(event));
  });
  const broadcast: Broadcast = (event, dashboardOnly = false) => {
    for (const socket of hub.clients) {
      if (socket.readyState === WebSocket.OPEN && (!dashboardOnly || roles.get(socket))) {
        if (socket.bufferedAmount > 256_000) socket.terminate();
        else socket.send(JSON.stringify(event));
      }
    }
  };
  return { hub, broadcast };
}
