import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Classification, Message, Story } from './types.js';

export interface Held {
  id: string; user: string; text: string; kind: 'vault' | 'hint' | 'pending';
  beatId: string | null; hintLevel: number | null; sealedAt: string; released: number;
  deleted: number; reason: string | null;
}
export class Store {
  db: Database.Database;
  warning = '';
  constructor(file: string, story: Story) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feed (id TEXT PRIMARY KEY, user TEXT, at TEXT, kind TEXT, label TEXT, text TEXT, beatId TEXT, hintLevel INTEGER);
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS holds (
        id TEXT PRIMARY KEY, user TEXT NOT NULL, text TEXT NOT NULL, kind TEXT NOT NULL,
        beatId TEXT, hintLevel INTEGER, sealedAt TEXT NOT NULL, released INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0, reason TEXT
      );
      CREATE TABLE IF NOT EXISTS latency (id INTEGER PRIMARY KEY, messageId TEXT, label TEXT, ms REAL, outcome TEXT);
      CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, points INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS first_seal (beatId TEXT PRIMARY KEY, user TEXT NOT NULL);
    `);
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (?, ?)').run('currentBeat', story.beats[0].id);
    const fingerprint = JSON.stringify(story);
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (?, ?)').run('storyMap', fingerprint);
    const saved = this.db.prepare('SELECT value FROM state WHERE key = ?').get('storyMap') as { value: string };
    if (saved.value !== fingerprint) throw new Error('Story map changed. Use a fresh .data database for the new story.');
  }
  resetStory(story: Story, currentBeat: string) {
    this.db.transaction(() => {
      for (const table of ['feed', 'state', 'seen', 'holds', 'latency', 'points', 'first_seal']) this.db.exec(`DELETE FROM ${table}`);
      this.db.prepare('INSERT INTO state VALUES (?,?)').run('storyMap', JSON.stringify(story));
      this.db.prepare('INSERT INTO state VALUES (?,?)').run('currentBeat', currentBeat);
    })();
    this.warning = '';
  }
  get currentBeat() {
    return (this.db.prepare('SELECT value FROM state WHERE key = ?').get('currentBeat') as { value: string }).value;
  }
  claim(id: string) { return this.db.prepare('INSERT OR IGNORE INTO seen VALUES (?)').run(id).changes > 0; }
  hold(message: Message, kind: Held['kind'], result?: Classification, reason: string | null = null) {
    this.db.prepare(`INSERT INTO holds (id,user,text,kind,beatId,hintLevel,sealedAt,reason)
      VALUES (@id,@user,@text,@kind,@beatId,@hintLevel,@sealedAt,@reason)`).run({
      id: message.id, user: message.user.toLowerCase(), text: message.text, kind,
      beatId: result?.beatId ?? null, hintLevel: result?.hintLevel ?? null,
      sealedAt: message.at || new Date().toISOString(), reason,
    });
    if (kind === 'vault' && result?.beatId) {
      this.db.prepare('INSERT OR IGNORE INTO first_seal VALUES (?, ?)').run(result.beatId, message.user.toLowerCase());
    }
  }
  markDeleted(id: string) { this.db.prepare('UPDATE holds SET deleted = 1 WHERE id = ?').run(id); }
  counts() {
    const count = (kind: string) => (this.db.prepare('SELECT count(*) AS n FROM holds WHERE kind = ? AND released = 0').get(kind) as { n: number }).n;
    return { vaultCount: count('vault'), jarCount: count('hint'), pendingCount: count('pending') };
  }
  leaderboard() { return this.db.prepare('SELECT user, points FROM points ORDER BY points DESC, user').all() as { user: string; points: number }[]; }
  logLatency(id: string, label: string, ms: number, outcome: string) {
    this.db.prepare('INSERT INTO latency (messageId,label,ms,outcome) VALUES (?,?,?,?)').run(id, label, ms, outcome);
  }
  nextHint() {
    return this.db.transaction(() => {
      const item = this.db.prepare(`SELECT * FROM holds WHERE kind = 'hint' AND released = 0
        ORDER BY hintLevel ASC, sealedAt ASC, rowid ASC LIMIT 1`).get() as Held | undefined;
      if (item) {
        this.db.prepare('UPDATE holds SET released = 1 WHERE id = ?').run(item.id);
        this.db.prepare(`INSERT INTO state (key,value) VALUES ('lastHintId',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(item.id);
      }
      return item;
    })();
  }
  release(beatId: string, reachedIds: string[]) {
    return this.db.transaction(() => {
      this.db.prepare('UPDATE state SET value = ? WHERE key = ?').run(beatId, 'currentBeat');
      const eligible = this.db.prepare(`SELECT * FROM holds WHERE kind = 'vault' AND released = 0
        ORDER BY sealedAt, rowid`).all() as Held[];
      const items = eligible.filter(item => item.beatId && reachedIds.includes(item.beatId));
      const add = this.db.prepare(`INSERT INTO points VALUES (?, ?)
        ON CONFLICT(user) DO UPDATE SET points = points + excluded.points`);
      for (const item of items) {
        this.db.prepare('UPDATE holds SET released = 1 WHERE id = ?').run(item.id);
        add.run(item.user, 1);
        const first = this.db.prepare('SELECT user FROM first_seal WHERE beatId = ?').get(item.beatId) as { user: string };
        const bonus = this.db.prepare('INSERT OR IGNORE INTO state VALUES (?, ?)').run(`bonus:${item.beatId}`, 'awarded');
        if (bonus.changes) add.run(first.user, 3);
      }
      return items;
    })();
  }
  addFeed(message: Message, kind: string, result?: Classification) {
    this.db.prepare('INSERT OR IGNORE INTO feed VALUES (?,?,?,?,?,?,?,?)').run(message.id, message.user,
      message.at || new Date().toISOString(), kind, result?.label || 'pending', kind === 'chat' ? message.text : null,
      result?.beatId || null, result?.hintLevel || null);
  }
  desk() {
    const rows = this.db.prepare('SELECT * FROM feed ORDER BY rowid DESC LIMIT 300').all().reverse();
    const vault = (this.db.prepare(`SELECT user, beatId, sealedAt, length(text) AS length FROM holds
      WHERE kind = 'vault' AND released = 0 ORDER BY sealedAt`).all());
    const levels = [1, 2, 3, 4, 5].map(level => (this.db.prepare(`SELECT count(*) AS n FROM holds
      WHERE kind = 'hint' AND released = 0 AND hintLevel = ?`).get(level) as { n: number }).n);
    const lastHint = this.db.prepare(`SELECT text, user, hintLevel AS level FROM holds WHERE kind = 'hint'
      AND id = (SELECT value FROM state WHERE key = 'lastHintId')`).get() || null;
    const latency = this.db.prepare('SELECT ms, outcome FROM latency ORDER BY id').all() as { ms: number; outcome: string }[];
    const sorted = latency.map(r => r.ms).sort((a, b) => a - b);
    const stats = { processed: latency.length, sealed: latency.filter(r => r.outcome === 'sealed').length,
      hints: latency.filter(r => r.outcome === 'jar').length,
      avg: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] || 0 };
    return { feed: rows, vault, levels, lastHint, stats, warning: this.warning, ...this.counts() };
  }
  close() { this.db.close(); }
}
