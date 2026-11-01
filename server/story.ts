import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './config.js';
import type { Beat, Story } from './types.js';

export function validateStory(value: unknown): Story {
  const story = value as Story;
  if (!story || typeof story.game !== 'string' || !Array.isArray(story.beats) || !story.beats.length) {
    throw new Error('Story needs a game name and at least one beat');
  }
  const ids = new Set<string>(), orders = new Set<number>();
  for (const beat of story.beats) {
    if (!beat || typeof beat.id !== 'string' || !beat.id || !Number.isInteger(beat.order) ||
      beat.order < 1 || typeof beat.chapter !== 'string' || typeof beat.summary !== 'string' ||
      !Array.isArray(beat.secrets) || beat.secrets.some(s => typeof s !== 'string') ||
      ids.has(beat.id) || orders.has(beat.order)) throw new Error('Invalid or duplicate story beat');
    ids.add(beat.id); orders.add(beat.order);
  }
  return { game: story.game, beats: [...story.beats].sort((a, b) => a.order - b.order) };
}
export function loadStory(file = join(root, 'story/story-map.json')): Story {
  return validateStory(JSON.parse(readFileSync(file, 'utf8')));
}
export function findBeat(story: Story, id: string): Beat {
  const beat = story.beats.find(b => b.id === id);
  if (!beat) throw new Error(`Unknown beat: ${id}`);
  return beat;
}
