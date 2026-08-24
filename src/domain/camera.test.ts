import {describe, expect, it} from 'vitest';
import {buildCameraTrack, fixedCameraBounds} from './camera';
import {MOTION} from './motion-constants';
import {buildPlaybackTrack} from './playback';
import {defaultVideoConfig, type TrackPoint} from './timeline';
import {sampleScenarioById} from '@/samples/scenarios';

const point = (timestamp: number, latitude: number, longitude: number, breakBefore = false): TrackPoint => ({
  id: `${timestamp}`, timestamp, latitude, longitude, breakBefore,
  timezoneOffsetMinutes: 0, activity: breakBefore ? 'flying' : 'walking', kind: 'path', cumulativeDistanceMeters: 0,
});

const mercator = (latitude: number, longitude: number) => ({
  x: (longitude + 180) / 360,
  y: (1 - Math.asinh(Math.tan(Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180)) / Math.PI) / 2,
});
const wrappedDifference = (value: number) => {
  let result = value;
  while (result > 0.5) result -= 1;
  while (result < -0.5) result += 1;
  return result;
};
const maximumScreenJerk = (camera: ReturnType<typeof buildCameraTrack>) => {
  const velocities = camera.slice(1).map((value, index) => {
    const before = mercator(camera[index].latitude, camera[index].longitude);
    const after = mercator(value.latitude, value.longitude);
    const worldPixels = MOTION.camera.tileSize * 2 ** ((camera[index].zoom + value.zoom) / 2);
    return {x: wrappedDifference(after.x - before.x) * worldPixels, y: (after.y - before.y) * worldPixels};
  });
  return Math.max(0, ...velocities.slice(1).map((value, index) => Math.hypot(value.x - velocities[index].x, value.y - velocities[index].y)));
};

describe('camera track', () => {
  it('keeps zoom within the embedded map limit and moves without a coordinate jump', () => {
    const config = defaultVideoConfig(0, 10_000);
    config.playback.durationSeconds = 5;
    config.camera.zoom = 8;
    const playback = buildPlaybackTrack([point(0, 37, 127), point(5_000, 37.1, 127.1), point(10_000, 40, -73, true)], config);
    const camera = buildCameraTrack(playback, config, 8);
    expect(camera).toHaveLength(playback.durationInFrames);
    expect(camera[0].longitude).toBeGreaterThanOrEqual(-180);
    expect(camera[0].longitude).toBeLessThanOrEqual(180);
    expect(Math.max(...camera.map((value) => value.zoom))).toBeLessThanOrEqual(8);
    expect(camera[100].longitude).not.toBe(-73);
    expect(Math.min(...camera.map((value) => value.zoom))).toBeLessThan(8);
    const maximumZoomStep = Math.max(...camera.slice(1).map((value, index) => Math.abs(value.zoom - camera[index].zoom)));
    const allowedStep = Math.max(MOTION.camera.maximumZoomOutPerSecond, MOTION.camera.maximumZoomInPerSecond * MOTION.camera.arrivalZoomSpeedMultiplier) / config.output.fps;
    expect(maximumZoomStep).toBeLessThanOrEqual(allowedStep + 0.0001);
  });

  it('starts zooming out before a future long-distance move', () => {
    const config = defaultVideoConfig(0, 20_000);
    config.playback.durationSeconds = 8;
    config.camera.zoom = 12;
    config.camera.anticipationSeconds = 4;
    const playback = buildPlaybackTrack([point(0, 37, 127), point(10_000, 37.01, 127.01), point(20_000, 48, 2, true)], config);
    const camera = buildCameraTrack(playback, config, 12);
    expect(Math.min(...camera.slice(0, 220).map((value) => value.zoom))).toBeLessThan(camera[0].zoom);
  });

  it('recovers zoom after a long-distance round trip without snapping', () => {
    const config = defaultVideoConfig(0, 20_000);
    config.camera.zoom = 12;
    config.camera.anticipationSeconds = 5;
    const points = [
      {...point(0, 37, 127), frame: 0},
      {...point(5_000, 10, 106, true), frame: 150},
      {...point(10_000, 37, 127, true), frame: 300},
      {...point(15_000, 37.02, 127.02), frame: 450},
      {...point(20_000, 37.03, 127.03), frame: 599},
    ];
    const camera = buildCameraTrack({
      points,
      durationInFrames: 600,
      phases: [
        {kind: 'outbound', startPointIndex: 0, endPointIndex: 1, startFrame: 0, endFrame: 150, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
        {kind: 'return', startPointIndex: 1, endPointIndex: 2, startFrame: 150, endFrame: 300, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
        {kind: 'routine', startPointIndex: 2, endPointIndex: 4, startFrame: 300, endFrame: 599, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
      ],
    }, config, 12);
    const minimum = Math.min(...camera.map((value) => value.zoom));
    expect(camera[80].zoom).toBeLessThan(camera[0].zoom);
    expect(camera.at(-1)!.zoom).toBeGreaterThan(minimum + 1);
    const maximumStep = Math.max(...camera.slice(1).map((value, index) => Math.abs(value.zoom - camera[index].zoom)));
    expect(maximumStep).toBeLessThanOrEqual(MOTION.camera.maximumZoomInPerSecond * MOTION.camera.arrivalZoomSpeedMultiplier / config.output.fps + 0.0001);
  });

  it('holds the camera near the destination until the return phase approaches', () => {
    const config = defaultVideoConfig(0, 30_000);
    config.camera.zoom = 12;
    const points = [
      {...point(0, 37, 127), frame: 0},
      {...point(5_000, 10, 106, true), frame: 150},
      {...point(10_000, 10.1, 106.1), frame: 300},
      {...point(15_000, 10.05, 106.05), frame: 400},
      {...point(20_000, 37, 127, true), frame: 550},
      {...point(30_000, 37.02, 127.02), frame: 599},
    ];
    const camera = buildCameraTrack({
      points,
      durationInFrames: 600,
      phases: [
        {kind: 'outbound', startPointIndex: 0, endPointIndex: 1, startFrame: 0, endFrame: 150, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
        {kind: 'destination', startPointIndex: 1, endPointIndex: 3, startFrame: 150, endFrame: 400, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
        {kind: 'return', startPointIndex: 3, endPointIndex: 4, startFrame: 400, endFrame: 550, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
        {kind: 'routine', startPointIndex: 4, endPointIndex: 5, startFrame: 550, endFrame: 599, distanceMeters: 0, actualDurationMs: 0, minimumSeconds: 0},
      ],
    }, config, 12);
    expect(Math.abs(camera[260].longitude - 106)).toBeLessThan(5);
    expect(Math.abs(camera.at(-1)!.longitude - 127)).toBeLessThan(2);
  });

  it('fits a date-line crossing through the short longitude interval', () => {
    const bounds = fixedCameraBounds([point(0, 35, 170), point(1, 25, -170)]);
    expect(bounds[1][0] - bounds[0][0]).toBe(20);
    expect(bounds[0][1]).toBe(25);
    expect(bounds[1][1]).toBe(35);
  });

  it('damps camera jerk and repeated zoom pulses on multi-continent routes', () => {
    const timeline = sampleScenarioById('round-the-world').timeline;
    const adaptiveConfig = defaultVideoConfig(Date.parse(timeline.summary.startTime), Date.parse(timeline.summary.endTime));
    const adaptiveTrack = buildPlaybackTrack(timeline.points, adaptiveConfig);
    const adaptiveCamera = buildCameraTrack(adaptiveTrack, adaptiveConfig);
    expect(maximumScreenJerk(adaptiveCamera)).toBeLessThan(500);

    const followConfig = {...adaptiveConfig, camera: {...adaptiveConfig.camera, mode: 'follow' as const}};
    const followTrack = buildPlaybackTrack(timeline.points, followConfig);
    const followCamera = buildCameraTrack(followTrack, followConfig);
    const zoomTravel = followCamera.slice(1).reduce((sum, value, index) => sum + Math.abs(value.zoom - followCamera[index].zoom), 0);
    expect(zoomTravel).toBeLessThan(30);
  });
});
