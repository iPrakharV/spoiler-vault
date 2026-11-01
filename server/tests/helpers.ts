import { randomUUID } from 'node:crypto';
import { Store } from '../store.js';
import { Pipeline } from '../pipeline.js';
import { Controls } from '../controls.js';
import type { Classifier, Classification, Message, Story } from '../types.js';

export const story: Story = { game: 'Test story', beats: [
  { id: 'b1', order: 1, chapter: 'Arrival', summary: 'Arrive at a station.', secrets: [] },
  { id: 'b2', order: 2, chapter: 'Window', summary: 'Find a key.', secrets: ['The key is brass.'] },
  { id: 'b3', order: 3, chapter: 'Keeper', summary: 'Meet a familiar keeper.', secrets: ['The keeper is you.'] },
  { id: 'b4', order: 4, chapter: 'Train', summary: 'The train arrives.', secrets: ['The lantern breaks the loop.'] },
] };
export const normal: Classification = { label: 'normal', beatId: null, hintLevel: null, confidence: 1 };
export const spoiler = (beatId = 'b3'): Classification => ({ label: 'future_spoiler', beatId, hintLevel: null, confidence: 1 });
export function message(text = 'hello', user = 'viewer', extra: Partial<Message> = {}): Message {
  return { id: randomUUID(), text, user, ...extra };
}
export function setup(classify: Classifier = async () => normal) {
  const store = new Store(':memory:', story);
  const events: { event: { type: string; [key: string]: unknown }; dashboardOnly: boolean }[] = [];
  const deleted: string[] = [], replies: string[] = [];
  const transport = { deleteMessage: async (id: string) => { deleted.push(id); }, reply: async (text: string) => { replies.push(text); } };
  const pipeline = new Pipeline(story, store, classify, transport, (event, dashboardOnly = false) => events.push({ event, dashboardOnly }));
  const controls = new Controls(pipeline);
  return { pipeline, controls, store, events, deleted, replies, transport };
}
