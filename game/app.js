const $ = id => document.getElementById(id);
let beatId, busy = false;
async function load() {
  const res = await fetch('/api/game');
  if (!res.ok) throw new Error('Could not load the case file.');
  const scene = await res.json(); beatId = scene.beatId;
  $('chapter').textContent = `Chapter ${String(scene.index).padStart(2, '0')} / ${String(scene.total).padStart(2, '0')}`;
  $('title').textContent = scene.title; $('body').replaceChildren(); $('choices').replaceChildren();
  for (const text of scene.body) { const p = document.createElement('p'); p.textContent = text; $('body').append(p); }
  for (const choice of scene.choices) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.text;
    button.addEventListener('click', () => answer(choice.id)); $('choices').append(button);
  }
  $('record').textContent = scene.index === scene.total ? 'Case closed' : `Entry ${scene.index} of ${scene.total}`;
}
async function answer(answer) {
  if (busy) return; busy = true; $('feedback').textContent = '';
  for (const button of $('choices').children) button.disabled = true;
  try {
    const response = await fetch('/api/game/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beatId, answer }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    await load();
    // The server validates the puzzle before accepting this same-beat progress acknowledgement.
    await fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beatId }) });
  } catch (error) { $('feedback').textContent = error.message; }
  finally { busy = false; for (const button of $('choices').children) button.disabled = false; }
}
setInterval(() => { if (!busy) fetch('/api/status').then(r => r.json()).then(s => { if (s.currentBeat !== beatId) load().catch(showError); }).catch(showError); }, 1500);
function showError(error) { $('feedback').textContent = error.message; }
load().catch(showError);
