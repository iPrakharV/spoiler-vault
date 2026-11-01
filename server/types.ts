export const labels = ['normal', 'past_talk', 'future_spoiler', 'backseat'] as const;
export type Label = typeof labels[number];
export interface Beat { id: string; order: number; chapter: string; summary: string; secrets: string[] }
export interface Story { game: string; beats: Beat[] }
export interface Classification {
  label: Label; beatId: string | null; confidence: number; hintLevel: number | null;
}
export interface Message {
  id: string; user: string; text: string; at?: string;
  broadcaster?: boolean; bot?: boolean; expected?: Classification;
}
export type Classifier = (text: string, currentBeat: string, timeoutMs?: number) => Promise<Classification>;
export type Broadcast = (event: { type: string; [key: string]: unknown }, dashboardOnly?: boolean) => void;
export interface Transport { deleteMessage(id: string): Promise<void>; reply(text: string): Promise<void> }
