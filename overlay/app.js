import { mountIcons } from '/shared/icons.js';
const $ = (id) => document.getElementById(id);
mountIcons();
const query = new URLSearchParams(location.search),
  demo = query.get('demo') === '1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let entries = [],
  awards = [],
  toastRunning = false,
  revealRunning = false,
  hintTimer,
  boardTimer;
const demoCounts = { vaultCount: 3, jarCount: 2 };
const clipEvents = new Map(), clipShown = new Set(), clipWaiting = new Map();
const toasts = [],
  reveals = [];
function beatNumber(id) {
  return String(id).replace(/^b/, '');
}
function scene(name) {
  document.body.dataset.scene = name;
}
function setCount(id, count) {
  const el = $(id);
  if (el.textContent === String(count)) return;
  el.textContent = count;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
function show(id, animation = 'fade-in') {
  $(id).hidden = false;
  $(id).classList.remove('fade-out', 'leave', 'enter', 'fade-in');
  $(id).classList.add(animation);
}
async function hide(id, animation = 'fade-out', duration = 250) {
  $(id).classList.remove('enter', 'fade-in');
  $(id).classList.add(animation);
  await wait(duration);
  $(id).hidden = true;
}
async function runToasts() {
  if (toastRunning) return;
  toastRunning = true;
  while (toasts.length) {
    const item = toasts.shift();
    $('toast-title').textContent = `@${item.user} sealed a prediction`;
    $('toast-beat').textContent = `opens at beat ${beatNumber(item.beatId)}`;
    scene('toast');
    show('toast', 'enter');
    await wait(3500);
    await hide('toast', 'leave', 220);
  }
  toastRunning = false;
}
function renderLeaders() {
  $('leaders').replaceChildren();
  entries.slice(0, 5).forEach((entry, i) => {
    const row = document.createElement('li'),
      rank = document.createElement('span'),
      name = document.createElement('span'),
      points = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(i + 1).padStart(2, '0');
    name.textContent = `@${entry.user}`;
    points.className = 'points';
    points.textContent = entry.points;
    row.append(rank, name, points);
    $('leaders').append(row);
  });
}
function board() {
  if (!entries.length) return;
  clearTimeout(boardTimer);
  renderLeaders();
  scene('leaderboard');
  show('leaderboard');
  boardTimer = setTimeout(() => hide('leaderboard'), 6000);
}
async function showClip(data) {
  if (clipShown.has(data)) return;
  if (!clipEvents.has(data.beatId)) { clipWaiting.set(data.beatId, data); return; }
  clipWaiting.delete(data.beatId);
  clipShown.add(data);
  const first = data.items[0];
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(first.sealedAt)) / 60000));
  const replay = clipEvents.get(data.beatId).clipId.startsWith('replay-');
  $('clip-copy').textContent = `${replay ? 'Replay clip' : 'Clipped'}. @${first.user} called it ${minutes} min ago.`;
  scene('clip'); show('clip-note');
  await wait(4000);
  await hide('clip-note');
}
async function runReveals() {
  if (revealRunning) return;
  revealRunning = true;
  await hide('leaderboard');
  while (reveals.length) {
    const data = reveals.shift();
    if (!demo) {
      try {
        awards = await (await fetch('/api/awards')).json();
      } catch {
        awards = [];
      }
    }
    $('reveal-beat').textContent = `beat ${beatNumber(data.beatId)}`;
    const more = Math.max(0, data.items.length - 5);
    $('more').hidden = true;
    $('more').textContent = more ? `+${more} more in the vault log` : '';
    scene('reveal');
    show('reveal');
    for (const item of data.items.slice(0, 5)) {
      const text = item.text;
      const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(item.sealedAt)) / 60000));
      $('reveal-byline').textContent = `sealed ${minutes} min ago by @${item.user}`;
      const firstCall =
        item.firstCall ??
        awards.some((a) => a.user.toLowerCase() === item.user.toLowerCase() && a.sealedAt === item.sealedAt);
      $('first-call').hidden = !firstCall;
      $('reveal-text').textContent = reduced.matches ? text : '';
      $('crack').classList.remove('cracking');
      void $('crack').offsetWidth;
      await wait(800);
      $('crack').classList.add('cracking');
      await wait(500);
      if (!reduced.matches) {
        const charMs = 25;
        for (let i = 1; i <= text.length; i++) {
          $('reveal-text').textContent = text.slice(0, i);
          await wait(charMs);
        }
      }
      await wait(5000);
    }
    if (more) {
      $('more').hidden = false;
      await wait(1500);
    }
    await hide('reveal');
    await showClip(data);
  }
  revealRunning = false;
  board();
}
function event(data) {
  if (demo && ['sealed', 'hint', 'reveal'].includes(data.type)) {
    if (data.type === 'sealed') demoCounts.vaultCount++;
    if (data.type === 'hint') demoCounts.jarCount++;
    if (data.type === 'reveal')
      demoCounts.vaultCount = Math.max(0, demoCounts.vaultCount - data.items.length);
    setCount('sealed-count', demoCounts.vaultCount);
    setCount('hint-count', demoCounts.jarCount);
  }
  if (data.type === 'clip') {
    clipEvents.set(data.beatId, data);
    const waiting = clipWaiting.get(data.beatId);
    if (waiting) void showClip(waiting);
  }
  if (data.type === 'status') {
    setCount('sealed-count', data.vaultCount);
    setCount('hint-count', data.jarCount);
  }
  if (data.type === 'sealed') {
    if (toasts.length < 100) toasts.push(data);
    runToasts();
  }
  if (data.type === 'hint') {
    clearTimeout(hintTimer);
    $('hint-level').textContent = `Hint ${data.level} of 5`;
    $('hint-text').textContent = data.text;
    $('hint-user').textContent = `from @${data.user}`;
    scene('hint');
    show('hint');
    hintTimer = setTimeout(() => hide('hint'), 8000);
  }
  if (data.type === 'reveal') {
    reveals.push(data);
    return runReveals();
  }
  if (data.type === 'leaderboard') {
    entries = data.entries;
    if (!$('leaderboard').hidden) renderLeaders();
  }
}
function fit() {
  $('overlay').style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
}
addEventListener('resize', fit);
fit();
function connect() {
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${wsProto}//${location.host}/ws`);
  socket.onmessage = (e) => {
    void event(JSON.parse(e.data));
  };
  socket.onclose = () => setTimeout(connect, 1500);
  socket.onerror = () => socket.close();
}
if (demo) {
  const sealedAt = new Date(Date.now() - 47 * 60000).toISOString();
  awards = [{ user: 'tali', beatId: 'b5', sealedAt }];
  const fake = {
    toast: { type: 'sealed', user: 'tali', beatId: 'b5', at: new Date().toISOString() },
    hint: {
      type: 'hint',
      user: 'nell',
      text: 'Compare the marks on the paper strip with the code card.',
      level: 2,
    },
    reveal: {
      type: 'reveal',
      beatId: 'b5',
      items: [
        {
          user: 'tali',
          text: 'Mara is the captain of Orison. She hid the ship to keep the witnesses safe.',
          sealedAt,
          firstCall: true,
        },
        {
          user: 'reed',
          text: 'Six names on that manifest. They were passengers, not cargo.',
          sealedAt: new Date(Date.now() - 21 * 60000).toISOString(),
        },
      ],
    },
    leaderboard: {
      type: 'leaderboard',
      entries: [
        { user: 'tali', points: 8 },
        { user: 'moss', points: 5 },
        { user: 'reed', points: 4 },
        { user: 'mira', points: 4 },
        { user: 'ellis', points: 1 },
      ],
    },
  };
  event({ type: 'status', currentBeat: 'b3', vaultCount: 3, jarCount: 2 });
  event(fake.leaderboard);
  const preview = query.get('scene');
  if (preview && fake[preview]) {
    setTimeout(() => {
      if (preview === 'leaderboard') board();
      else event(fake[preview]);
    }, 250);
  } else {
    async function cycle() {
      event(fake.toast);
      await wait(4200);
      event(fake.hint);
      await wait(8500);
      await event(fake.reveal);
      await wait(6500);
      cycle();
    }
    setTimeout(cycle, 400);
  }
} else connect();
