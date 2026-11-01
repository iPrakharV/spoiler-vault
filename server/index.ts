import { createApp } from './app.js';
import { config } from './config.js';
import { Twitch } from './twitch.js';
import { EventSub } from './eventsub.js';

const app = createApp();
const twitch = new Twitch();
const events = new EventSub(twitch, async event => {
  console.log(`Chat received from ${event.chatter_user_login}`);
});
twitch.mountAuth(app, () => events.start());
if (twitch.hasTokens) events.start().catch(error => console.error(error.message));
setInterval(() => {
  if (twitch.hasTokens) twitch.refresh().catch(error => console.error(error.message));
}, 30_000).unref();
setInterval(() => {
  if (twitch.hasTokens) twitch.identify().catch(error => { events.stop(); console.error(error.message); });
}, 3_600_000).unref();
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Spoiler Vault: http://localhost:${config.port}/dashboard/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  events.stop(); server.close(() => process.exit(0));
});
