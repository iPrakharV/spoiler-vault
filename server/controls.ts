import type { Express } from 'express';
import type { Pipeline } from './pipeline.js';
import { findBeat } from './story.js';
import { route } from './twitch.js';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class Controls {
  constructor(readonly pipeline: Pipeline) {
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
    if (released.length) broadcast({ type: 'reveal', beatId, items: released.map(({ user, text, sealedAt }) => ({ user, text, sealedAt })) });
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
    app.get('/api/session', (_req, res) => {
      const { story, store } = this.pipeline;
      const current = findBeat(story, store.currentBeat);
      res.json({ game: story.game,
        beats: story.beats.map(({ id, order, chapter }) => ({ id, order, chapter })),
        current: { id: current.id, chapter: current.chapter, summary: current.summary },
      });
    });
    app.post('/api/hint', route(async (_req, res) => { res.json(await this.hint()); }));
    app.post('/api/progress', route((req, res) => {
      if (typeof req.body?.beatId !== 'string') throw new HttpError(400, 'beatId is required');
      res.json(this.progress(req.body.beatId));
    }));
  }
}
