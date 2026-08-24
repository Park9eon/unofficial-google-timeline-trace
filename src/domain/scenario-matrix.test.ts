import {describe, expect, it} from 'vitest';
import {buildCameraTrack} from './camera';
import {MOTION} from './motion-constants';
import {buildPlaybackTrack, samplePlayback} from './playback';
import {defaultVideoConfig, outputDimensions, videoConfigSchema} from './timeline';
import {sampleScenarios} from '@/samples/scenarios';

const mercator = (latitude: number, longitude: number) => ({
  x: (longitude + 180) / 360,
  y: (1 - Math.asinh(Math.tan(Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180)) / Math.PI) / 2,
});

const wrappedDifference = (left: number, right: number) => {
  let difference = left - right;
  while (difference > 0.5) difference -= 1;
  while (difference < -0.5) difference += 1;
  return difference;
};

const zoomDirectionReversals = (zooms: number[], fps: number) => {
  let direction = 0;
  let lastChange = Number.NEGATIVE_INFINITY;
  let reversals = 0;
  for (let index = 1; index < zooms.length; index += 1) {
    const delta = zooms[index] - zooms[index - 1];
    const next = Math.abs(delta) < 1e-4 ? direction : Math.sign(delta);
    if (direction && next && next !== direction && index - lastChange >= fps * 0.75) {
      reversals += 1;
      lastChange = index;
    }
    direction = next;
  }
  return reversals;
};

describe('synthetic story scenario matrix', () => {
  it('covers the published synthetic story catalog', () => {
    expect(sampleScenarios).toHaveLength(20);
    expect(new Set(sampleScenarios.map((scenario) => scenario.id)).size).toBe(20);
    expect(sampleScenarios.every((scenario) => scenario.timeline.summary.sourceHash.startsWith('sample-'))).toBe(true);
  });

  it('keeps timing, camera, and viewport invariants across every story', () => {
    const timingModes = ['cinematic', 'fixed-duration'] as const;
    const cameraModes = ['adaptive', 'follow', 'fixed'] as const;
    const aspectRatios = ['16:9', '9:16', '1:1'] as const;
    const frameRates = [30, 60] as const;
    let combinations = 0;

    for (const scenario of sampleScenarios) {
      for (const mode of timingModes) for (const cameraMode of cameraModes) for (const aspectRatio of aspectRatios) for (const fps of frameRates) {
        const points = scenario.timeline.points;
        const config = defaultVideoConfig(points[0].timestamp, points.at(-1)!.timestamp);
        config.playback.mode = mode;
        config.playback.durationSeconds = 12;
        config.camera.mode = cameraMode;
        config.output.aspectRatio = aspectRatio;
        config.output.fps = fps;
        config.marker.type = combinations % 2 ? 'emoji' : 'circle';
        config.map.stylePreset = (['night-pulse', 'paper-atlas', 'mono-fog', 'deep-ocean', 'forest-glow', 'sunset-dusk', 'blueprint', 'clean-light'] as const)[combinations % 8];
        videoConfigSchema.parse(config);
        const track = buildPlaybackTrack(points, config);
        expect(track.points[0].frame).toBe(0);
        expect(track.points.at(-1)!.frame).toBe(track.durationInFrames - 1);
        expect(track.points.every((value, index) => index === 0 || value.frame >= track.points[index - 1].frame)).toBe(true);
        expect(track.phases.every((phase, index) => phase.startFrame <= phase.endFrame && (index === 0 || phase.startPointIndex === track.phases[index - 1].endPointIndex))).toBe(true);

        const probeFrames = [...new Set([0, Math.floor(track.durationInFrames / 3), Math.floor(track.durationInFrames * 2 / 3), track.durationInFrames - 1])];
        for (const frame of probeFrames) {
          const sample = samplePlayback(track, frame);
          expect(Number.isFinite(sample?.point.latitude)).toBe(true);
          expect(Number.isFinite(sample?.point.longitude)).toBe(true);
        }

        if (cameraMode !== 'fixed') {
          const camera = buildCameraTrack(track, config, MOTION.camera.maximumOverzoom);
          const dimensions = outputDimensions(config);
          expect(camera).toHaveLength(track.durationInFrames);
          expect(camera.every((value) => Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && value.zoom >= MOTION.camera.minimumZoom && value.zoom <= MOTION.camera.maximumOverzoom)).toBe(true);
          const maximumZoomStep = Math.max(0, ...camera.slice(1).map((value, index) => Math.abs(value.zoom - camera[index].zoom)));
          expect(maximumZoomStep).toBeLessThanOrEqual(MOTION.camera.maximumZoomInPerSecond * MOTION.camera.arrivalZoomSpeedMultiplier / fps + 0.0001);
          const tenSecondWindows = Math.max(1, Math.ceil(camera.length / (fps * 10)));
          expect(zoomDirectionReversals(camera.map((value) => value.zoom), fps), `${scenario.id}/${mode}/${cameraMode}/${aspectRatio}/${fps}`).toBeLessThanOrEqual(tenSecondWindows * 3 + track.phases.length);
          for (const frame of probeFrames) {
            const sample = samplePlayback(track, frame)!;
            const marker = mercator(sample.point.latitude, sample.point.longitude);
            const center = mercator(camera[frame].latitude, camera[frame].longitude);
            const worldPixels = MOTION.camera.tileSize * 2 ** camera[frame].zoom;
            const phase = track.phases.find((candidate) => frame >= candidate.startFrame && frame <= candidate.endFrame);
            const safeRatio = phase && ['outbound', 'return', 'transition'].includes(phase.kind) ? MOTION.camera.travelMarkerSafeViewportRatio : MOTION.camera.markerSafeViewportRatio;
            expect(Math.abs(wrappedDifference(marker.x, center.x)) * worldPixels).toBeLessThanOrEqual(dimensions.width * (safeRatio + 0.001));
            expect(Math.abs(marker.y - center.y) * worldPixels).toBeLessThanOrEqual(dimensions.height * (safeRatio + 0.001));
          }
        }
        combinations += 1;
      }
    }
    expect(combinations).toBe(sampleScenarios.length * 36);
  }, 60_000);
});
