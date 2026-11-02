import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const ffmpeg =
  process.env.FFMPEG || resolve('work/media-tools/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg');
const { rawVideo, marks: m } = JSON.parse(readFileSync('work/media-recordings/timeline.json', 'utf8'));
function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('ffmpeg failed');
}
const clips = [
  [m.catchStart, m.catchEnd],
  [m.revealStart, m.revealEnd],
  [m.boardStart, m.boardEnd],
];
const filters =
  clips.map(([start, end], i) => `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`).join(';') +
  ';[v0][v1][v2]concat=n=3:v=1:a=0,fps=24,format=yuv420p[out]';
run([
  '-i',
  rawVideo,
  '-filter_complex',
  filters,
  '-map',
  '[out]',
  '-an',
  '-c:v',
  'libx264',
  '-crf',
  '19',
  '-preset',
  'medium',
  '-movflags',
  '+faststart',
  'docs/media/demo.mp4',
]);
// The palette is generated from the finished cut, then applied in a second pass.
run([
  '-i',
  'docs/media/demo.mp4',
  '-vf',
  'fps=12,scale=1200:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff',
  '-frames:v',
  '1',
  'work/media-recordings/palette.png',
]);
run([
  '-i',
  'docs/media/demo.mp4',
  '-i',
  'work/media-recordings/palette.png',
  '-lavfi',
  'fps=12,scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
  '-loop',
  '0',
  'docs/media/demo.gif',
]);
const bytes = statSync('docs/media/demo.gif').size,
  duration = clips.reduce((sum, [a, b]) => sum + b - a, 0);
if (bytes >= 8_000_000 || duration < 12 || duration > 15)
  throw new Error('Demo is outside the requested size or duration');
writeFileSync(
  'work/media-recordings/encoded.json',
  JSON.stringify({ duration, bytes, width: 1200, clips }, null, 2) + '\n',
);
console.log(`Demo: ${duration.toFixed(2)} seconds, ${bytes} bytes, 1200px wide.`);
