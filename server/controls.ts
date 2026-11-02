import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Express } from 'express';
import type { Held } from './store.js';
import type { Pipeline } from './pipeline.js';
import { findBeat } from './story.js';
import { isDemoStory } from './storymap.js';
import { mountGame } from './game.js';
import { route } from './twitch.js';
import { ProgressRequestSchema } from './schemas.js';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class Controls {
  constructor(readonly pipeline: Pipeline, private onReveal: (beatId: string, items: Held[]) => void = () => {}) {
    pipeline.releaseHint = () => this.hint();
    pipeline.releaseReached = () => { this.progress(pipeline.store.currentBeat); };
  }
  progress(beatId: string) {
    const { story, store, broadcast } = this.pipeline;
    let target;
    try { target = findBeat(story, beatId); } catch { throw new HttpError(400, 'Unknown beatId'); }
    if (target.order < findBeat(story, store.currentBeat).order) {
      throw new HttpError(409, 'Progress cannot move backwards. Start a fresh session to replay.');
    }
    const released = store.release(beatId, story.beats.filter(b => b.order <= target.order).map(b => b.id));
    if (released.length) {
      broadcast({ type: 'reveal', beatId, items: released.map(({ user, text, sealedAt }) => ({ user, text, sealedAt })) });
      this.onReveal(beatId, released);
    }
    broadcast({ type: 'leaderboard', entries: store.leaderboard() });
    broadcast(this.pipeline.status());
    return { currentBeat: beatId };
  }
  async hint() {
    const { store, broadcast } = this.pipeline;
    const item = store.nextHint();
    if (!item) {
      await this.pipeline.reply('The hint jar is empty.');
      return { released: false };
    }
    broadcast({ type: 'hint', text: item.text, user: item.user, level: item.hintLevel });
    broadcast(this.pipeline.status());
    await this.pipeline.reply(`Hint from @${item.user}: ${item.text}`.slice(0, 500));
    return { released: true };
  }
  mount(app: Express) {
    mountGame(app, this);
    app.get('/api/reveal-clips', (_req, res) => res.json(this.pipeline.store.db.prepare(
      'SELECT beatId, clipId, url, user, sealedAt, replay FROM reveals WHERE clipId IS NOT NULL ORDER BY rowid').all()));
    app.get('/api/desk', (_req, res) => res.json(this.pipeline.store.desk()));
    app.get('/api/awards', (_req, res) => {
      const { store, story } = this.pipeline;
      const reached = story.beats.filter(b => b.order <= findBeat(story, store.currentBeat).order).map(b => b.id);
      const entries = store.db.prepare(`SELECT f.beatId, f.user,
        (SELECT sealedAt FROM holds h WHERE h.beatId = f.beatId AND h.user = f.user AND h.kind = 'vault' ORDER BY rowid LIMIT 1) AS sealedAt
        FROM first_seal f`).all() as { beatId: string; user: string; sealedAt: string }[];
      res.json(entries.filter(e => reached.includes(e.beatId)));
    });
    app.get('/api/session', (_req, res) => {
      const { story, store } = this.pipeline;
      const current = findBeat(story, store.currentBeat);
      const demo = isDemoStory(story);
      res.json({ game: story.game,
        beats: story.beats.map(({ id, order, chapter }) => ({ id, order, chapter: demo && order <= current.order ? chapter : `Beat ${order}` })),
        current: { id: current.id, chapter: demo ? current.chapter : `Beat ${current.order}` },
      });
    });
    app.post('/api/hint', route(async (_req, res) => { res.json(await this.hint()); }));
    app.post('/api/progress', route((req, res) => {
      const parsed = ProgressRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'beatId is required');
      res.json(this.progress(parsed.data.beatId));
    }));
    app.post('/api/chat/simulate', route(async (req, res) => {
      const { user = 'viewer', text } = req.body || {};
      if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'text is required');
      const id = randomUUID();
      const chatter = String(user).trim() || 'viewer';
      const start = performance.now();
      await this.pipeline.process({
        id,
        user: chatter,
        text: text.trim(),
        broadcaster: chatter.toLowerCase() === 'broadcaster',
      });
      const elapsed = Number((performance.now() - start).toFixed(2));
      const desk = this.pipeline.store.desk();
      const feed = desk.feed as Array<{ id: string; label?: string; kind?: string; beatId?: string | null; hintLevel?: number | null; caughtMs?: number | null }>;
      const entry = feed.find(f => f.id === id);
      res.json({
        ok: true,
        id,
        user: chatter,
        text: text.trim(),
        label: entry?.label || 'normal',
        kind: entry?.kind || 'chat',
        beatId: entry?.beatId ?? null,
        hintLevel: entry?.hintLevel ?? null,
        caughtMs: entry?.caughtMs ?? elapsed,
        totalMs: elapsed,
      });
    }));
  }
}
