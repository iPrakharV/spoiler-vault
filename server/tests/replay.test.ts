import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import { root } from '../config.js';

async function replay(auto: boolean) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/replay.ts', '--offline', '--speed=40', '--exit', ...(auto ? ['--auto'] : [])],
    {
      cwd: root,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  const events: {
    type: string;
    currentBeat?: string;
    vaultCount?: number;
    entries?: { points: number }[];
  }[] = [];
  let socket: WebSocket | undefined;
  child.stdout.on('data', (raw) => {
    output += raw;
    const url = output.match(/http:\/\/localhost:(\d+)\/dashboard/);
    if (url && !socket) {
      socket = new WebSocket(`ws://127.0.0.1:${url[1]}/ws`);
      socket.on('message', (raw) => events.push(JSON.parse(raw.toString())));
      socket.on('error', () => {});
    }
  });
  child.stderr.on('data', (raw) => {
    output += raw;
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, output);
    return { output, events };
  } finally {
    clearTimeout(timer);
    socket?.terminate();
    child.kill('SIGTERM');
  }
}

test('replay --auto emits reveals, lowers the vault count and awards points', async () => {
  const { events, output } = await replay(true);
  assert(
    events.some((e) => e.type === 'reveal'),
    output,
  );
  assert(
    events.some((e) => e.type === 'leaderboard' && e.entries?.some((row) => row.points > 0)),
    output,
  );
  const counts = events.filter((e) => e.type === 'status').map((e) => e.vaultCount!);
  assert(
    counts.some((count, i) => i > 0 && count < counts[i - 1]),
    output,
  );
  assert.match(output, /"currentBeat":"b6"/);
});

test('replay defaults to manual progress and does not release future beats', async () => {
  const { events, output } = await replay(false);
  assert(!events.some((e) => e.type === 'reveal'));
  assert.match(output, /"currentBeat":"b1"/);
});
