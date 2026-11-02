import { z } from 'zod';
import { labels } from './types.js';

export const LabelSchema = z.enum(labels as unknown as [string, ...string[]]);

export const ClassificationSchema = z.object({
  label: LabelSchema,
  beatId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  hintLevel: z.number().int().min(1).max(5).nullable(),
});

export const BeatSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  chapter: z.string(),
  summary: z.string(),
  secrets: z.array(z.string()),
});

export const StorySchema = z.object({
  game: z.string().min(1),
  beats: z.array(BeatSchema).min(1),
});

export const MessageSchema = z.object({
  id: z.string().min(1),
  user: z.string().min(1),
  text: z.string(),
  at: z.string().optional(),
  broadcaster: z.boolean().optional(),
  bot: z.boolean().optional(),
  expected: ClassificationSchema.optional(),
});

export const ProgressRequestSchema = z.object({
  beatId: z.string().min(1),
});

export const StoryMapGenerateRequestSchema = z.object({
  game: z.string().min(1),
  howFar: z.string().optional(),
});

export const StoryMapSelectRequestSchema = z.object({
  map: z.string().min(1),
});

