import WebSocket from 'ws';
import type { Twitch } from './twitch.js';

export interface ChatEvent {
  broadcaster_user_id: string; chatter_user_id: string; chatter_user_login: string;
  message_id: string; message: { text: string };
  badges?: { set_id: string }[];
}
const endpoint = 'wss://eventsub.wss.twitch.tv/ws';

export class EventSub {
  private sockets = new Set<WebSocket>();
  private timer?: NodeJS.Timeout;
  private stopped = true;
  private attempts = 0;
  private seen = new Set<string>();
  private startupId = 0;
  private starting?: Promise<void>;
  state = 'disconnected';
  constructor(private twitch: Twitch,
    private onChat: (event: ChatEvent, at: string) => Promise<void>,
    private onState: (state: string) => void = console.log,
    private openSocket: (url: string) => WebSocket = url => new WebSocket(url, { handshakeTimeout: 10_000 })) {}
  private report(state: string) { this.state = state; this.onState(state); }
  async start() {
    if (this.starting) return this.starting;
    this.stop();
    const currentId = ++this.startupId;
    this.stopped = false;
    const task = (async () => {
      try {
        await this.twitch.identify();
        if (this.stopped || this.startupId !== currentId) return;
        const id = this.twitch.broadcasterId;
        await this.twitch.api(`chat/settings?broadcaster_id=${id}&moderator_id=${id}`, 'PATCH', {
          non_moderator_chat_delay: true, non_moderator_chat_delay_duration: 6,
        });
        if (this.stopped || this.startupId !== currentId) return;
        this.report('connecting');
        this.connect(endpoint);
      } catch (error) {
        if (!this.stopped && this.startupId === currentId) {
          this.stop();
          throw error;
        }
      } finally {
        if (this.startupId === currentId) this.starting = undefined;
      }
    })();
    this.starting = task;
    return task;
  }
  stop() {
    this.stopped = true;
    this.startupId++;
    this.starting = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear();
    this.report('disconnected');
  }
  private connect(url: string, previous?: WebSocket) {
    if (this.stopped) return;
    // Only accept Twitch's reconnect host, never send an arbitrary URL a socket.
    const target = new URL(url);
    if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv') {
      this.report('invalid_reconnect_url'); this.stop(); return;
    }
    const socket = this.openSocket(url);
    this.sockets.add(socket);
    let welcomed = false;
    let timeoutMs = 12_000;
    let watchdog: NodeJS.Timeout;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => socket.terminate(), timeoutMs);
    };
    arm();
    socket.on('message', raw => {
      arm();
      void (async () => {
        const packet = JSON.parse(raw.toString());
        const { metadata, payload } = packet;
        if (this.seen.has(metadata.message_id)) return;
        this.seen.add(metadata.message_id);
        if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
        switch (metadata.message_type) {
          case 'session_welcome': {
            welcomed = true;
            timeoutMs = (payload.session.keepalive_timeout_seconds || 10) * 1000 + 2000;
            arm();
            if (!previous) {
              const id = this.twitch.broadcasterId;
              await this.twitch.api('eventsub/subscriptions', 'POST', {
                type: 'channel.chat.message', version: '1',
                condition: { broadcaster_user_id: id, user_id: id },
                transport: { method: 'websocket', session_id: payload.session.id },
              });
            }
            // A reconnect carries subscriptions. Close the old socket only after welcome.
            previous?.close();
            this.attempts = 0;
            this.report('connected');
            break;
          }
          case 'session_keepalive': break;
          case 'session_reconnect': this.connect(payload.session.reconnect_url, socket); break;
          case 'notification':
            if (payload.subscription.type === 'channel.chat.message') {
              await this.onChat(payload.event, metadata.message_timestamp);
            }
            break;
          case 'revocation':
            this.stop(); this.report(`revoked:${payload.subscription.status}`); break;
        }
      })().catch(error => {
        console.error('EventSub:', error.message);
        this.report('event_error');
        socket.terminate();
      });
    });
    socket.on('error', () => this.report('connection_error'));
    socket.on('close', () => {
      clearTimeout(watchdog);
      this.sockets.delete(socket);
      if (this.stopped) return;
      if (previous && !welcomed && this.sockets.has(previous)) {
        previous.terminate();
        this.sockets.delete(previous);
      }
      if (this.sockets.size) return;
      if (!this.timer) {
        this.report('reconnecting_gap');
        const waitMs = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5));
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.connect(endpoint);
        }, waitMs);
      }
    });
  }
}
