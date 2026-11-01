import type { Express } from 'express';
import type { Pipeline } from './pipeline.js';
import { findBeat } from './story.js';
import { route } from './twitch.js';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class Controls {
  constructor(readonly pipeline: Pipeline) {
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
  mount(app: Express) {
    app.post('/api/progress', route((req, res) => {
      if (typeof req.body?.beatId !== 'string') throw new HttpError(400, 'beatId is required');
      res.json(this.progress(req.body.beatId));
    }));
  }
}
