import { createServer } from 'node:http';
import type { Express } from 'express';
import { config } from './config.js';
import { createApp, errorHandler } from './app.js';
import { createHub } from './broadcast.js';
import { Controls } from './controls.js';
import { Pipeline } from './pipeline.js';
import { mountStoryMaps, type StoryMapOptions } from './storymap.js';
import { RevealClips, type ClipResult } from './clips.js';
import { Store } from './store.js';
import type { Classifier, Story, Transport } from './types.js';

interface Options {
  story: Story; file: string; classify: Classifier; transport: Transport;
  mode: 'live' | 'replay'; classifierReady: boolean; connection?: () => string;
  createClip?: () => Promise<ClipResult>;
  storyMaps?: StoryMapOptions;
  configure?: (app: Express, pipeline: Pipeline) => void;
}
export function createRuntime(options: Options) {
  const app = createApp(), server = createServer(app), store = new Store(options.file, options.story);
  const { hub, broadcast } = createHub(server, () => [pipeline.status(), { type: 'leaderboard', entries: store.leaderboard() }]);
  const pipeline = new Pipeline(options.story, store, options.classify, options.transport, broadcast);
  const clips = new RevealClips(store, broadcast, options.mode, () => options.connection?.() === 'connected', options.createClip);
  const controls = new Controls(pipeline, (beatId, items) => clips.record(beatId, items));
  controls.mount(app);
  mountStoryMaps(app, pipeline, { persist: options.mode === 'live', ...options.storyMaps });
  app.get('/api/status', (_req, res) => res.json({ ...pipeline.status(), mode: options.mode,
    channel: options.mode === 'replay' ? 'harbor_watch' : config.channel, pendingCount: store.counts().pendingCount,
    classifierReady: options.classifierReady, twitch: options.connection?.() || 'disconnected' }));
  options.configure?.(app, pipeline);
  app.use(errorHandler);
  return { app, server, pipeline, controls, store, broadcast,
    listen(port: number): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
          server.off('error', reject);
          resolve((server.address() as { port: number }).port);
        });
      });
    },
    close(): Promise<void> {
      clips.close();
      for (const socket of hub.clients) socket.terminate();
      hub.close();
      return new Promise((resolve, reject) => server.close(error => {
        store.close(); error ? reject(error) : resolve();
      }));
    },
  };
}
