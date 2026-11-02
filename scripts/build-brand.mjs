import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const opentype = require('../work/media-tools/node_modules/opentype.js');
mkdirSync('docs/media', { recursive: true });
function font(path) {
  const data = readFileSync(path);
  return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}
const regular = font('shared/fonts/plex-2.ttf'),
  semibold = font('shared/fonts/plex-4.ttf');
function text(value, x, y, size, face, color) {
  const path = face.getPath(value, x, y, size, { kerning: true, hinting: false });
  const number = (n) => {
    if (!Number.isFinite(n)) throw new Error('Invalid font coordinate');
    return n.toFixed(2);
  };
  const keys = {
    M: ['x', 'y'],
    L: ['x', 'y'],
    Q: ['x1', 'y1', 'x', 'y'],
    C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'],
    Z: [],
  };
  const data = path.commands
    .map((command) => command.type + keys[command.type].map((key) => number(command[key])).join(' '))
    .join('');
  return `<path fill="${color}" d="${data}"/>`;
}
function seal(x, y, size) {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})"><path fill="#E5484D" d="m12 0 3 2 3.5.2 1.3 3.3 2.5 2.5-.8 3.4.8 3.4-2.5 2.5-1.3 3.3-3.5.2-3 2-3-2-3.5-.2-1.3-3.3L1.7 15l.8-3.4-.8-3.4 2.5-2.5L5.5 2.4 9 2Z"/><path fill="none" stroke="#0E0F11" stroke-width="1.5" stroke-linejoin="round" d="M9 10V8a3 3 0 0 1 6 0v2m-7 0h8v7H8z"/></g>`;
}
const tagline = 'Chat can call the twist. Nobody sees it until the streamer gets there.';
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="320" viewBox="0 0 1280 320" role="img" aria-labelledby="title desc"><title id="title">Spoiler Vault</title><desc id="desc">${tagline}</desc><rect width="1280" height="320" fill="#0E0F11"/>${seal(68, 94, 132)}${text('Spoiler Vault', 254, 158, 64, semibold, '#E8E6E1')}${text(tagline, 255, 207, 24, regular, '#8B8F98')}</svg>`;
writeFileSync('docs/media/banner.svg', banner + '\n');
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-label="Spoiler Vault"><rect width="1280" height="640" fill="#0E0F11"/>${seal(80, 226, 168)}${text('Spoiler Vault', 302, 298, 80, semibold, '#E8E6E1')}${text('Chat can call the twist.', 304, 357, 29, regular, '#8B8F98')}${text('Nobody sees it until the streamer gets there.', 304, 401, 29, regular, '#8B8F98')}</svg>`;
writeFileSync('work/social-preview.svg', social + '\n');
console.log('Brand paths generated from IBM Plex Sans 600 and 400. No SVG text nodes.');
