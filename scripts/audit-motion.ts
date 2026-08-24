import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {buildCameraTrack} from '../src/domain/camera';
import {parseTimeline} from '../src/domain/parse-timeline';
import {buildPlaybackTrack} from '../src/domain/playback';
import {defaultVideoConfig} from '../src/domain/timeline';
import {simplifyPlaybackTrack} from '../src/domain/track-simplification';
import {timelineFixture} from './timeline-fixture';

const measure = <T>(work: () => T) => {
  const startedAt = performance.now();
  const value = work();
  return {value, milliseconds: Number((performance.now() - startedAt).toFixed(1))};
};

const main = async () => {
  const input = process.argv[2];
  const raw = input ? await readFile(input, 'utf8') : JSON.stringify(timelineFixture);
  const parsed = measure(() => parseTimeline(raw, input ?? 'synthetic-timeline.json'));
  const timeline = parsed.value;
  const config = defaultVideoConfig(Date.parse(timeline.summary.startTime), Date.parse(timeline.summary.endTime));
  const playback = measure(() => buildPlaybackTrack(timeline.points, config));
  const camera = measure(() => buildCameraTrack(playback.value, config));
  const simplified = measure(() => simplifyPlaybackTrack(playback.value.points));
  const timestampsMonotonic = timeline.points.every((point, index) => index === 0 || point.timestamp >= timeline.points[index - 1].timestamp);

  console.log(JSON.stringify({
    sourcePoints: timeline.points.length,
    sourceBreaks: timeline.points.filter((point) => point.breakBefore).length,
    timestampsMonotonic,
    durationInFrames: playback.value.durationInFrames,
    phases: playback.value.phases.reduce<Record<string, number>>((counts, phase) => ({...counts, [phase.kind]: (counts[phase.kind] ?? 0) + 1}), {}),
    cameraFrames: camera.value.length,
    simplifiedTrailPoints: simplified.value.length,
    retainedHardBreaks: simplified.value.filter((point) => point.breakBefore).length,
    milliseconds: {
      parse: parsed.milliseconds,
      playback: playback.milliseconds,
      camera: camera.milliseconds,
      trailSimplification: simplified.milliseconds,
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
