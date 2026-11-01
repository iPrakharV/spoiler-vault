import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApp, errorHandler } from './app.js';
import { config, root } from './config.js';
import { Twitch } from './twitch.js';
import { EventSub } from './eventsub.js';
import { createHub } from './broadcast.js';
import { loadStory } from './story.js';
import { Store } from './store.js';
import { openAIClassifier } from './classifier.js';
import { Pipeline } from './pipeline.js';
import { Controls } from './controls.js';

const app = createApp(), server = createServer(app);
const story = loadStory(), store = new Store(join(root, '.data/live.sqlite'), story);
const twitch = new Twitch();
const { hub, broadcast } = createHub(server, () => [pipeline.status(), { type: 'leaderboard', entries: store.leaderboard() }]);
const pipeline = new Pipeline(story, store, openAIClassifier(story), {
  deleteMessage: id => twitch.api<void>(`moderation/chat?${new URLSearchParams({
    broadcaster_id: twitch.broadcasterId, moderator_id: twitch.userId, message_id: id,
  })}`, 'DELETE'),
  reply: async message => {
    const response = await twitch.api<{ data: { is_sent: boolean }[] }>('chat/messages', 'POST', {
      broadcaster_id: twitch.broadcasterId, sender_id: twitch.userId, message,
    });
    if (!response.data[0]?.is_sent) throw new Error('Twitch did not send bot reply');
  },
}, broadcast);
const controls = new Controls(pipeline);
controls.mount(app);
const events = new EventSub(twitch, async (event, at) => {
  await pipeline.process({ id: event.message_id, user: event.chatter_user_login, text: event.message.text, at,
    broadcaster: event.chatter_user_id === twitch.broadcasterId });
}, state => { console.log(`Twitch: ${state}`); broadcast({ type: 'connection', state }, true); });
twitch.mountAuth(app, () => events.start());
app.get('/api/status', (_req, res) => res.json({ ...pipeline.status(), twitch: events.state }));
app.use(errorHandler);
if (twitch.hasTokens) events.start().catch(error => console.error(error.message));
setInterval(() => {
  if (twitch.hasTokens) twitch.refresh().catch(error => console.error(error.message));
}, 30_000).unref();
setInterval(() => {
  if (twitch.hasTokens) twitch.identify().catch(error => { events.stop(); console.error(error.message); });
}, 3_600_000).unref();
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Spoiler Vault: http://localhost:${config.port}/dashboard/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  events.stop(); hub.close(); server.close(() => { store.close(); process.exit(0); });
  for (const socket of hub.clients) socket.terminate();
});
