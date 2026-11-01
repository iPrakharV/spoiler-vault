const $ = (id) => document.getElementById(id);
let beats = [],
  currentBeat,
  online = false,
  retries = 0;
const busy = new Set();
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}
function buttons() {
  const index = beats.findIndex((beat) => beat.id === currentBeat);
  $('next').disabled = !online || index < 0 || index === beats.length - 1 || busy.has('next');
  $('hint').disabled = !online || Number($('jar').textContent) === 0 || busy.has('hint');
}
function status(data) {
  currentBeat = data.currentBeat;
  $('vault').textContent = data.vaultCount;
  $('jar').textContent = data.jarCount;
  const index = beats.findIndex((beat) => beat.id === currentBeat);
  const beat = beats[index];
  $('beat').textContent = currentBeat || 'Start';
  $('chapter').textContent = beat?.chapter || 'Waiting for story';
  $('beat-index').textContent =
    `${String(index + 1).padStart(2, '0')} / ${String(beats.length).padStart(2, '0')}`;
  $('progress-fill').style.width = `${beats.length ? ((index + 1) / beats.length) * 100 : 0}%`;
  $('pending').textContent = data.pendingCount
    ? `${data.pendingCount} held for review`
    : 'No messages pending review';
  buttons();
}
async function sync() {
  const [sessionRes, stateRes] = await Promise.all([fetch('/api/session'), fetch('/api/status')]);
  if (!sessionRes.ok || !stateRes.ok) throw new Error('Could not load the current session.');
  const session = await sessionRes.json(),
    state = await stateRes.json();
  beats = session.beats;
  $('connect').hidden = state.mode === 'replay';
  $('game').textContent = session.game.toUpperCase();
  $('story-title').textContent = session.current.chapter;
  $('summary').textContent = session.current.summary;
  status(state);
  connection(
    state.mode === 'replay'
      ? 'Replay mode'
      : state.twitch === 'connected'
        ? 'Live chat connected'
        : 'Twitch disconnected',
    state.mode === 'replay' || state.twitch === 'connected',
  );
  if (state.mode !== 'replay' && !state.classifierReady)
    notice('Add an OpenAI key before going live. Messages will be held while classification is unavailable.');
}
function connection(text, ready) {
  $('connection').textContent = text;
  $('dot').classList.toggle('ready', ready);
}
function chat(data) {
  $('empty-chat')?.remove();
  const row = document.createElement('div');
  row.className = 'chat-row';
  const name = document.createElement('span');
  name.className = 'username';
  name.textContent = `@${data.user}`;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const text = document.createElement('p');
  text.textContent = data.text;
  row.append(name, time, text);
  $('chat').append(row);
  while ($('chat').children.length > 200) $('chat').firstElementChild.remove();
  $('chat').scrollTop = $('chat').scrollHeight;
}
function leaderboard(entries) {
  $('leaderboard').replaceChildren();
  if (!entries.length) {
    const row = document.createElement('li');
    row.className = 'leader-empty';
    row.textContent = 'Good predictions need good timing.';
    $('leaderboard').append(row);
  }
  for (const [index, entry] of entries.slice(0, 5).entries()) {
    const row = document.createElement('li'),
      user = document.createElement('span'),
      points = document.createElement('strong');
    user.textContent = `${String(index + 1).padStart(2, '0')}  @${entry.user}`;
    points.textContent = entry.points;
    row.append(user, points);
    $('leaderboard').append(row);
  }
}
async function action(id, url, body) {
  busy.add(id);
  buttons();
  notice('');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not complete that action.');
    await sync();
  } catch (error) {
    notice(error.message);
  } finally {
    busy.delete(id);
    buttons();
  }
}
$('next').addEventListener('click', () => {
  const next = beats[beats.findIndex((beat) => beat.id === currentBeat) + 1];
  if (next) action('next', '/api/progress', { beatId: next.id });
});
$('hint').addEventListener('click', () => action('hint', '/api/hint'));
function connect() {
  const socket = new WebSocket(
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?role=dashboard`,
  );
  socket.onopen = () => {
    online = true;
    retries = 0;
    sync().catch((error) => notice(error.message));
  };
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'status') {
      const changed = currentBeat !== data.currentBeat;
      status(data);
      if (changed) sync().catch((error) => notice(error.message));
    }
    if (data.type === 'chat') chat(data);
    if (data.type === 'leaderboard') leaderboard(data.entries);
    if (data.type === 'hint') {
      $('latest-hint').hidden = false;
      $('latest-hint').textContent = `@${data.user}: ${data.text}`;
    }
    if (data.type === 'connection') sync().catch((error) => notice(error.message));
    if (data.type === 'warning')
      notice(
        data.operation === 'delete_failed_possible_leak'
          ? 'Twitch could not delete a message. It may have appeared in chat. Check the server terminal.'
          : 'A chat action failed. Check the server terminal.',
      );
  };
  socket.onclose = () => {
    online = false;
    connection('Server disconnected', false);
    buttons();
    setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(retries++, 5)));
  };
  socket.onerror = () => socket.close();
}
connect();
