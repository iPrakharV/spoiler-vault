import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Express } from 'express';
import type { Controls } from './controls.js';
import { root } from './config.js';
import { route } from './twitch.js';
interface Scene { title: string; body: string[]; choices: { id: string; text: string }[]; answer: string | null; wrong?: string }
const scenes = JSON.parse(readFileSync(join(root, 'story/game-scenes.json'), 'utf8')) as Scene[];
export function mountGame(app: Express, controls: Controls) {
  const current = () => controls.pipeline.story.beats.findIndex(b => b.id === controls.pipeline.store.currentBeat);
  app.get('/api/game', (_req, res) => {
    const index = current(), scene = scenes[index];
    res.json({ beatId: controls.pipeline.store.currentBeat, index: index + 1, total: scenes.length,
      title: scene.title, body: scene.body, choices: scene.choices });
  });
  app.post('/api/game/answer', route((req, res) => {
    const index = current(), scene = scenes[index];
    if (req.body?.beatId !== controls.pipeline.store.currentBeat) { res.status(409).json({ error: 'The story moved on. Reload this page.' }); return; }
    if (!scene.answer) { res.json({ finished: true }); return; }
    if (req.body?.answer !== scene.answer) { res.status(422).json({ error: scene.wrong || 'Try another choice.' }); return; }
    res.json(controls.progress(controls.pipeline.story.beats[index + 1].id));
  }));
}
