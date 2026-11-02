const $ = id => document.getElementById(id);
function show(id, text, time) { const el = $(id); el.textContent = text; el.hidden = false; setTimeout(() => { el.hidden = true; }, time); }
function event(data) {
  if (data.type === 'status') { $('sealed-count').textContent = `${data.vaultCount} sealed`; $('hint-count').textContent = `${data.jarCount} hints`; }
  if (data.type === 'sealed') show('toast', `@${data.user} sealed a prediction. Opens at ${data.beatId}.`, 3500);
  if (data.type === 'hint') show('hint', data.text, 8000);
  if (data.type === 'reveal') show('reveal', data.items.slice(0,5).map(item => `@${item.user}: ${item.text}`).join('\n'), 5000);
  if (data.type === 'leaderboard') show('leaderboard', data.entries.slice(0,5).map(e => `${e.user} ${e.points}`).join('\n'), 6000);
}
const socket = new WebSocket(`ws://${location.host}/ws`); socket.onmessage = e => event(JSON.parse(e.data));
