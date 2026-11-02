import { mountIcons } from '/shared/icons.js';
mountIcons();
const $ = id => document.getElementById(id);
let canGenerate = false;
let busy = false;
function render(data) {
  $('ready').textContent = `Story map ready: ${data.beatCount} beats. You're on beat ${data.currentOrder}.`;
  $('beats').replaceChildren();
  for (const beat of data.beats) {
    const li = document.createElement('li');
    li.textContent = `Beat ${beat.order}`;
    if (beat.id === data.currentBeat) li.setAttribute('aria-current', 'step');
    $('beats').append(li);
  }
  $('map').querySelector('[value=generated]').hidden = data.demo;
  $('map').value = data.demo ? 'demo' : 'generated';
}
function controls() {
  $('build').disabled = busy || !canGenerate;
  $('map').disabled = busy;
  $('build').textContent = busy ? 'Building story map...' : 'Build story map';
}
async function request(url, body) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not update the story map.');
  return data;
}
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !canGenerate) return;
  busy = true; controls(); $('message').textContent = '';
  try { render(await request('/api/storymap/generate', { game: $('game').value, howFar: $('progress').value })); }
  catch (error) { $('message').textContent = error.message; }
  finally { busy = false; controls(); }
});
$('map').addEventListener('change', async () => {
  if ($('map').value !== 'demo' || busy) return;
  busy = true; controls();
  try { render(await request('/api/storymap/select', { map: 'demo' })); $('message').textContent = ''; }
  catch (error) { $('message').textContent = error.message; }
  finally { busy = false; controls(); }
});
request('/api/storymap').then(data => {
  canGenerate = data.canGenerate; $('key-note').hidden = canGenerate; render(data); controls();
}).catch(error => { $('message').textContent = error.message; });
