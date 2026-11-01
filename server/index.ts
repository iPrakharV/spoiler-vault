import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.port, '127.0.0.1', () => {
  console.log(`Spoiler Vault: http://localhost:${config.port}/dashboard/`);
});
