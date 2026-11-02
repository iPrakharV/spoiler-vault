import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Broadcast } from './types.js';

export function createHub(server: Server, snapshot: () => object[]) {
  const allowedHost = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local|.*\.trycloudflare\.com|.*\.loca\.lt|.*\.onrender\.com|.*\.up\.railway\.app)(:\d+)?$/;
  const hub = new WebSocketServer({ server, path: '/ws', maxPayload: 1024,
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      const host = req.headers.host;
      if (!host || !allowedHost.test(host)) return false;
      const origin = req.headers.origin;
      return !origin || origin === `http://${host}` || origin === `https://${host}`;
    },
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
