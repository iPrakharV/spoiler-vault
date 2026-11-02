import { icon, mountIcons } from '/shared/icons.js';
const $ = (id) => document.getElementById(id);
mountIcons();
let session,
  state,
  desk,
  follow = true,
  online = false,
  loading = false;
const busy = new Set();
let lastId = '',
  feedCount = 0;
const colors = ['#D4B483', '#8DC6AD', '#E9A67E', '#C5C0AA', '#D39DAD', '#A8BF8A'];
function color(user) {
  let hash = 0;
  for (const c of user) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}
function number(beatId) {
  return session?.beats.find((b) => b.id === beatId)?.order || Number(beatId?.replace('b', '')) || 1;
}
function time(at) {
  return new Date(at).toLocaleTimeString('en-GB', { hour12: false });
}
function age(at) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 60000));
  return minutes ? `${minutes}m ago` : 'just now';
}
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}
function buttons() {
  $('next').disabled =
    !online || !session || number(state?.currentBeat) >= session.beats.length || busy.has('next');
  $('release').disabled = !online || !desk?.jarCount || busy.has('release');
}
function renderProgress() {
  $('stepper').replaceChildren();
  for (const beat of session.beats) {
    const row = document.createElement('li'),
      mark = document.createElement('span'),
      name = document.createElement('span');
    row.className =
      beat.order < number(state.currentBeat) ? 'done' : beat.id === state.currentBeat ? 'current' : 'future';
    if (row.className === 'current') row.setAttribute('aria-current', 'step');
    mark.className = 'number';
    if (row.className === 'done') mark.innerHTML = icon('check');
    else mark.textContent = String(beat.order).padStart(2, '0');
    name.textContent = row.className === 'future' ? `Beat ${beat.order}` : beat.chapter;
    row.append(mark, name);
    $('stepper').append(row);
  }
}
function row(item) {
  const el = document.createElement('div'),
    stamp = document.createElement('time'),
    text = document.createElement('span');
  el.className = `chat-row ${item.kind === 'chat' ? '' : `caught ${item.kind}`}`;
  el.dataset.id = item.id;
  el.dataset.kind = item.kind;
  stamp.dateTime = item.at;
  stamp.textContent = time(item.at);
  text.className = 'message';
  if (item.kind === 'chat') {
    const user = document.createElement('span');
    user.className = 'username';
    user.style.color = color(item.user);
    user.textContent = item.user;
    text.textContent = item.text;
    if (item.label === 'past_talk') {
      const tag = document.createElement('span');
      tag.className = 'past-tag';
      tag.textContent = 'past';
      text.append(tag);
    }
    el.append(stamp, user, text);
  } else {
    text.textContent =
      item.kind === 'vault'
        ? `@${item.user} sealed a spoiler for beat ${number(item.beatId)}`
        : item.kind === 'hint'
          ? `@${item.user} added a hint (level ${item.hintLevel})`
          : `@${item.user} held, classifier timed out`;
    el.append(stamp, text);
  }
  return el;
}
function renderFeed(items) {
  if (items.length === feedCount && items.at(-1)?.id === lastId) return;
  const chat = $('chat');
  const existing = new Set([...chat.querySelectorAll('[data-id]')].map((el) => el.dataset.id));
  if (items.length) chat.querySelector('.empty')?.remove();
  for (const item of items) if (!existing.has(item.id)) chat.append(row(item));
  while (chat.children.length > 300) chat.firstElementChild.remove();
  lastId = items.at(-1)?.id;
  feedCount = items.length;
  if (follow) chat.scrollTop = chat.scrollHeight;
  $('jump').hidden = follow;
}
function renderDesk() {
  $('vault-count').textContent = desk.vaultCount;
  $('jar-count').textContent = desk.jarCount;
  $('processed').textContent = desk.stats.processed;
  $('sealed-stat').textContent = desk.stats.sealed;
  $('hint-stat').textContent = desk.stats.hints;
  $('average').textContent = Math.round(desk.stats.avg);
  $('p95').textContent = Math.round(desk.stats.p95);
  renderFeed(desk.feed);
  $('vault-list').replaceChildren();
  if (!desk.vault.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No spoilers sealed.';
    $('vault-list').append(p);
  }
  for (const item of desk.vault) {
    const entry = document.createElement('div'),
      label = document.createElement('p'),
      bar = document.createElement('span');
    entry.className = 'vault-item';
    label.textContent = `@${item.user} · beat ${number(item.beatId)} · ${age(item.sealedAt)}`;
    bar.className = 'redacted';
    bar.style.width = `${Math.min(260, Math.max(48, item.length * 3))}px`;
    bar.setAttribute('aria-label', 'Message sealed');
    entry.append(label, bar);
    $('vault-list').append(entry);
  }
  $('pips').replaceChildren();
  desk.levels.forEach((count, i) => {
    const level = document.createElement('div');
    level.className = `level ${count ? 'occupied' : ''}`;
    level.title = `Level ${i + 1}: ${count} hints`;
    const pip = document.createElement('span'),
      value = document.createElement('span'),
      label = document.createElement('span');
    pip.className = 'level-mark';
    value.className = 'level-value';
    value.textContent = count;
    label.textContent = `L${i + 1}`;
    level.append(pip, value, label);
    $('pips').append(level);
  });
  $('latest-hint').hidden = !desk.lastHint;
  if (desk.lastHint) $('latest-hint').textContent = `@${desk.lastHint.user}: ${desk.lastHint.text}`;
  $('empty-hint').hidden = !!desk.jarCount || !!desk.lastHint;
  if (desk.warning)
    notice(
      desk.warning === 'delete_failed_possible_leak'
        ? 'Twitch could not delete a message. Check chat before continuing.'
        : 'A chat reply failed. Check the server terminal.',
    );
  buttons();
}
async function sync() {
  if (loading) return;
  loading = true;
  try {
    const responses = await Promise.all(
      ['/api/session', '/api/status', '/api/desk'].map((url) => fetch(url)),
    );
    if (responses.some((res) => !res.ok)) throw new Error('The server is not responding.');
    [session, state, desk] = await Promise.all(responses.map((res) => res.json()));
    $('channel').textContent = state.channel ? `/${state.channel}` : '/not connected';
    const mode = state.mode === 'replay' ? 'replay' : state.twitch === 'connected' ? 'live' : 'offline';
    $('connection').className = `connection ${online ? mode : 'offline'}`;
    $('connection-label').textContent = !online
      ? 'Offline'
      : mode === 'replay'
        ? 'Replay'
        : mode === 'live'
          ? 'Live on Twitch'
          : 'Offline';
    $('beat-number').textContent = `Beat ${number(state.currentBeat)} of ${session.beats.length}`;
    $('beat-chapter').textContent = session.current.chapter;
    $('connect').hidden = state.mode === 'replay' || state.twitch === 'connected';
    renderProgress();
    renderDesk();
    if (state.mode === 'live' && !state.classifierReady)
      notice('No classifier key is set. Incoming messages will be held.');
  } catch (error) {
    notice(error.message);
  } finally {
    loading = false;
  }
}
async function action(id, url, body = {}) {
  if (busy.has(id)) return;
  busy.add(id);
  buttons();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    await sync();
  } catch (error) {
    notice(error.message);
  } finally {
    busy.delete(id);
    buttons();
  }
}
$('next').addEventListener('click', () => {
  const next = session?.beats.find((b) => b.order > number(state.currentBeat));
  if (next) action('next', '/api/progress', { beatId: next.id });
});
$('release').addEventListener('click', () => action('release', '/api/hint'));
$('chat').addEventListener('scroll', () => {
  const chat = $('chat');
  follow = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
  $('jump').hidden = follow;
});
$('jump').addEventListener('click', () => {
  follow = true;
  $('chat').scrollTop = $('chat').scrollHeight;
  $('jump').hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
  )
    return;
  if (event.key.toLowerCase() === 'n' && !$('next').disabled) $('next').click();
  if (event.key.toLowerCase() === 'h' && !$('release').disabled) $('release').click();
});
function connect() {
  const socket = new WebSocket(`ws://${location.host}/ws?role=dashboard`);
  socket.onopen = () => {
    online = true;
    sync();
  };
  socket.onmessage = () => sync();
  socket.onclose = () => {
    online = false;
    $('connection').className = 'connection offline';
    $('connection-label').textContent = 'Offline';
    buttons();
    setTimeout(connect, 1500);
  };
  socket.onerror = () => socket.close();
}
connect();
setInterval(sync, 750);
