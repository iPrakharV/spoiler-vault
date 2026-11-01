import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Works from source and compiled dist/server without depending on the shell cwd.
const here = fileURLToPath(new URL('.', import.meta.url));
export const root = resolve(here, here.endsWith('/dist/server/') ? '../..' : '..');
export const config = {
  port: Number(process.env.PORT || 3000),
  clientId: process.env.TWITCH_CLIENT_ID || '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  channel: (process.env.TWITCH_CHANNEL || '').toLowerCase().replace(/^#/, ''),
  openaiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};
