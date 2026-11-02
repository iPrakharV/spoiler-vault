import { randomUUID } from 'node:crypto';
import type { Store, Held } from './store.js';
import type { Broadcast } from './types.js';

export interface ClipResult { id: string; edit_url: string }
export class RevealClips {
  private closed = false;
  constructor(private store: Store, private broadcast: Broadcast, private mode: 'live' | 'replay',
    private connected: () => boolean, private create?: () => Promise<ClipResult>) {}
  record(beatId: string, items: Held[]) {
    const id = randomUUID(), first = items[0];
    this.store.db.prepare(`INSERT INTO reveals (id,beatId,at,user,sealedAt,replay) VALUES (?,?,?,?,?,?)`)
      .run(id, beatId, new Date().toISOString(), first.user, first.sealedAt, this.mode === 'replay' ? 1 : 0);
    // A separate promise keeps clip requests out of the progress and reveal path.
    void Promise.resolve().then(async () => {
      if (this.closed || !this.store.db.prepare('SELECT id FROM reveals WHERE id=?').get(id)) return;
      if (this.mode === 'live' && (!this.connected() || !this.create)) throw new Error('channel offline');
      const result = this.mode === 'replay'
        ? { id: `replay-${id}`, edit_url: `https://example.com/replay-clip/${beatId}` }
        : await this.create!();
      if (!result.id || !/^https:\/\//.test(result.edit_url)) throw new Error('invalid clip response');
      if (this.closed) return;
      const url = this.mode === 'replay' ? result.edit_url : `https://clips.twitch.tv/${encodeURIComponent(result.id)}`;
      const updated = this.store.db.prepare('UPDATE reveals SET clipId=?, editUrl=?, url=? WHERE id=?')
        .run(result.id, result.edit_url, url, id);
      if (updated.changes) this.broadcast({ type: 'clip', beatId, clipId: result.id, url });
    }).catch(error => {
      console.error('Reveal clip:', error instanceof Error ? error.message : 'request failed');
      if (this.closed) return;
      const offline = /offline|\(404\)/i.test(String(error));
      this.store.db.prepare('UPDATE reveals SET error=? WHERE id=?')
        .run(offline ? 'Clip failed: channel offline' : 'Clip failed: Twitch request failed', id);
    });
  }
  close() { this.closed = true; }
}
