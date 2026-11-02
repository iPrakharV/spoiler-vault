import { join } from 'node:path';
import { config, root } from './config.js';
import { Twitch } from './twitch.js';
import { EventSub } from './eventsub.js';
import { loadActiveStory } from './storymap.js';
import { openAIClassifier } from './classifier.js';
import { createRuntime } from './runtime.js';

const story = loadActiveStory(), twitch = new Twitch();
let events: EventSub;
const runtime = createRuntime({ story, file: join(root, '.data/live.sqlite'), classify: openAIClassifier(story),
  mode: 'live', classifierReady: !!config.openaiKey, connection: () => events.state,
  transport: {
    deleteMessage: id => twitch.api<void>(`moderation/chat?${new URLSearchParams({
      broadcaster_id: twitch.broadcasterId, moderator_id: twitch.userId, message_id: id,
    })}`, 'DELETE'),
    reply: async message => {
      const response = await twitch.api<{ data: { is_sent: boolean }[] }>('chat/messages', 'POST', {
        broadcaster_id: twitch.broadcasterId, sender_id: twitch.userId, message,
      });
      if (!response.data[0]?.is_sent) throw new Error('Twitch did not send bot reply');
    },
  },
  configure: app => twitch.mountAuth(app, () => events.start()),
});
events = new EventSub(twitch, async (event, at) => {
  await runtime.pipeline.process({ id: event.message_id, user: event.chatter_user_login, text: event.message.text, at,
    broadcaster: event.chatter_user_id === twitch.broadcasterId });
}, state => { console.log(`Twitch: ${state}`);  });
if (twitch.hasTokens) events.start().catch(error => console.error(error.message));
setInterval(() => {
  if (twitch.hasTokens) twitch.refresh().catch(error => console.error(error.message));
}, 30_000).unref();
setInterval(() => {
  if (twitch.hasTokens) twitch.identify().catch(error => { events.stop(); console.error(error.message); });
}, 3_600_000).unref();
await runtime.listen(config.port);
console.log(`Spoiler Vault: http://localhost:${config.port}/dashboard/`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  events.stop(); void runtime.close().then(() => process.exit(0));
});
