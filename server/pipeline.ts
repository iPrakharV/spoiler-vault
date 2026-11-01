import { performance } from 'node:perf_hooks';
import { validateClassification } from './classifier.js';
import type { Store, Held } from './store.js';
import type { Broadcast, Classification, Classifier, Message, Story, Transport } from './types.js';

async function deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Classification timeout')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
export class Pipeline {
  releaseHint: () => Promise<unknown> = async () => undefined;
  releaseReached: () => void = () => {};
  constructor(readonly story: Story, readonly store: Store, private classify: Classifier,
    private transport: Transport, readonly broadcast: Broadcast) {}
  status() { return { type: 'status', currentBeat: this.store.currentBeat, ...this.store.counts() }; }
  private warn(operation: string, error: unknown) {
    console.error(`${operation}: ${error instanceof Error ? error.message : 'failed'}`);
    this.broadcast({ type: 'warning', operation, message: 'Action failed. Check the server terminal.' }, true);
  }
  async reply(text: string) {
    try { await this.transport.reply(text); } catch (error) { this.warn('chat_reply', error); }
  }
  private async hold(message: Message, kind: Held['kind'], result?: Classification, reason: string | null = null) {
    this.store.hold(message, kind, result, reason);
    try {
      await this.transport.deleteMessage(message.id);
      this.store.markDeleted(message.id);
    } catch (error) { this.warn('delete_failed_possible_leak', error); }
    if (kind === 'vault') {
      this.broadcast({ type: 'sealed', user: message.user, beatId: result!.beatId, at: message.at });
      await this.reply(`@${message.user} sealed until the reveal`);
      this.releaseReached();
    } else if (kind === 'hint') await this.reply(`@${message.user} saved to the hint jar`);
    this.broadcast(this.status());
  }
  async process(message: Message) {
    if (message.bot) return;
    if (message.broadcaster) {
      if (message.text.trim().toLowerCase() === '!hint' && this.store.claim(message.id)) await this.releaseHint();
      return;
    }
    if (!this.store.claim(message.id)) return;
    message = { ...message, at: message.at || new Date().toISOString() };
    const start = performance.now();
    const beatAtArrival = this.store.currentBeat;
    let result: Classification | undefined;
    let outcome = 'passed';
    try {
      // Leave time for Helix deletion before the six second visibility delay expires.
      const ageMs = Math.max(0, Date.now() - Date.parse(message.at!));
      const budget = Math.min(3500, 4200 - ageMs);
      try {
        if (!Number.isFinite(budget) || budget < 100) throw new Error('Message arrived too late to classify');
        result = validateClassification(await deadline(this.classify(message.text, beatAtArrival, budget), budget), this.story, beatAtArrival);
        if (result.confidence < 0.65) throw new Error('Low classification confidence');
      } catch (error) {
        outcome = 'pending';
        await this.hold(message, 'pending', undefined, error instanceof Error ? error.message : 'Classifier failed');
        return;
      }
      if (result.label === 'future_spoiler') {
        outcome = 'sealed'; await this.hold(message, 'vault', result);
      } else if (result.label === 'backseat') {
        outcome = 'jar'; await this.hold(message, 'hint', result);
      } else this.broadcast({ type: 'chat', user: message.user, text: message.text, label: result.label }, true);
    } finally {
      const ms = performance.now() - start;
      this.store.logLatency(message.id, result?.label || 'pending', ms, outcome);
      console.log(JSON.stringify({ type: 'latency', id: message.id, label: result?.label || 'pending', outcome, ms: Math.round(ms) }));
    }
  }
}
