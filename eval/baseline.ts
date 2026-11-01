import type { Classifier, Story } from '../server/types.js';
import { findBeat } from '../server/story.js';

// Deliberately simple, key-free reference. It does not read gold labels.
// This is only a baseline for exercising the harness, not the live classifier.
export function baseline(story: Story): Classifier {
  return async (text, currentBeat) => {
    const lower = text.toLowerCase();
    const current = findBeat(story, currentBeat).order;
    const words = new Set(lower.match(/[a-z]+/g) || []);
    const stop = new Set('the a an is and of to in it you your has from for at on with been'.split(' '));
    const matches = story.beats.filter(beat => beat.secrets.some(secret => {
      const tokens = [...new Set(secret.toLowerCase().match(/[a-z]+/g) || [])].filter(w => !stop.has(w));
      return tokens.length > 1 && tokens.filter(w => words.has(w)).length / tokens.length >= .6;
    }));
    const target = matches.sort((a, b) => b.order - a.order)[0];
    if (target) return { label: target.order > current ? 'future_spoiler' : 'past_talk', beatId: target.id, confidence: 1, hintLevel: null };
    if (/\b(try|click|press|go|look around|check|inspect|use|turn|walk|stop|should|need to|pick up|interact|search|examine|don't|do not|maybe)\b/.test(lower)) {
      return { label: 'backseat', beatId: null, confidence: 1, hintLevel: 3 };
    }
    return { label: 'normal', beatId: null, confidence: 1, hintLevel: null };
  };
}
