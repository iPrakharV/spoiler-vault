import { createApp } from './app.js';
import { config } from './config.js';
import { Twitch } from './twitch.js';

const app = createApp();
const twitch = new Twitch();
twitch.mountAuth(app);
if (twitch.hasTokens) twitch.identify().catch(error => console.error(error.message));
const maintenance = setInterval(() => {
  if (twitch.hasTokens) twitch.identify().catch(error => console.error(error.message));
}, 3_600_000);
maintenance.unref();
app.listen(config.port, '127.0.0.1', () => {
  console.log(`Spoiler Vault: http://localhost:${config.port}/dashboard/`);
});
