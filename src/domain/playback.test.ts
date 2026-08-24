import {describe, expect, it} from 'vitest';
import {interpolateLongitude} from './geo';
import {buildPlaybackTrack, filterLocationSpikes, resolvePlaybackDuration, samplePlayback} from './playback';
import {defaultVideoConfig, outputDimensions, type TrackPoint} from './timeline';

const point = (timestamp: number, longitude: number, breakBefore = false): TrackPoint => ({
  id: String(timestamp), timestamp, timezoneOffsetMinutes: 0, latitude: 0, longitude,
  activity: 'walking', kind: 'path', breakBefore, cumulativeDistanceMeters: timestamp / 1000,
});

describe('playback timeline', () => {
  it('maps a fixed-duration range to exact first and last frames', () => {
    const config = defaultVideoConfig(0, 10_000);
    config.playback.mode = 'fixed-duration';
    config.playback.durationSeconds = 10;
    config.playback.distanceInfluence = 0;
    const track = buildPlaybackTrack([point(0, 0), point(5_000, 5), point(10_000, 10)], config);
    expect(track.durationInFrames).toBe(300);
    expect(track.points.map((value) => value.frame)).toEqual([0, 150, 299]);
    expect(track.points[0].cumulativeDistanceMeters).toBe(0);
    expect(samplePlayback(track, 0)?.point.cumulativeDistanceMeters).toBe(0);
    const interpolatedLongitude = samplePlayback(track, 75)?.point.longitude ?? 0;
    expect(interpolatedLongitude).toBeGreaterThan(2);
    expect(interpolatedLongitude).toBeLessThan(3);
  });

  it('predicts a smooth geodesic position across an explicit break', () => {
    const config = defaultVideoConfig(0, 10_000);
    config.playback.mode = 'fixed-duration';
    config.playback.durationSeconds = 10;
    const track = buildPlaybackTrack([point(0, 170), point(10_000, -170, true)], config);
    const sample = samplePlayback(track, 150);
    expect(Math.abs(sample?.point.longitude ?? 0)).toBeGreaterThan(179);
    expect(sample?.isPredictedGap).toBe(true);
    expect(sample?.point.cumulativeDistanceMeters).toBeGreaterThan(0);
  });

  it('interpolates across the date line by the shortest direction', () => {
    expect(Math.abs(interpolateLongitude(179, -179, 0.5))).toBe(180);
  });

  it('resolves output dimensions for every aspect ratio', () => {
    const config = defaultVideoConfig(0, 1000);
    expect(outputDimensions(config)).toEqual({width: 1920, height: 1080});
    config.output.aspectRatio = '9:16';
    expect(outputDimensions(config)).toEqual({width: 1080, height: 1920});
    config.output.aspectRatio = '1:1';
    config.output.resolution = '4k';
    expect(outputDimensions(config)).toEqual({width: 2160, height: 2160});
  });

  it('keeps the requested fixed duration exactly', () => {
    const config = defaultVideoConfig(0, 14 * 86_400_000);
    config.playback.mode = 'fixed-duration';
    config.playback.durationSeconds = 47;
    expect(resolvePlaybackDuration([point(0, 0), point(config.range.end, 1)], config)).toBe(47);
  });

  it('increases cinematic dynamic duration monotonically with detail density', () => {
    const config = defaultVideoConfig(0, 10_000);
    const points = [point(0, 0), point(5_000, 1), point(10_000, 2)];
    config.playback.cinematicDensity = 0.5;
    const compact = resolvePlaybackDuration(points, config);
    config.playback.cinematicDensity = 2;
    expect(resolvePlaybackDuration(points, config)).toBeGreaterThan(compact);
  });

  it('allocates frames in proportion to traveled distance', () => {
    const config = defaultVideoConfig(0, 10_000);
    config.playback.mode = 'fixed-duration';
    config.playback.distanceInfluence = 1;
    config.playback.durationSeconds = 10;
    const track = buildPlaybackTrack([point(0, 0), point(5_000, 1), point(10_000, 3)], config);
    expect(track.points[1].frame).toBeGreaterThan(95);
    expect(track.points[1].frame).toBeLessThan(105);
  });

  it('removes a short-lived GPS spike that immediately returns to the same place', () => {
    const points = [point(0, 0), point(5 * 60_000, 10), point(10 * 60_000, 0.0001)];
    expect(filterLocationSpikes(points)).toHaveLength(2);
  });

  it('reserves travel and destination phases for a long-distance round trip', () => {
    const day = 86_400_000;
    const config = defaultVideoConfig(0, 5 * day);
    config.playback.durationSeconds = 10;
    config.playback.destinationHoldSeconds = 5;
    const track = buildPlaybackTrack([
      point(0, 127),
      point(day, 106, true),
      point(3 * day, 106.2),
      point(5 * day, 127, true),
    ], config);
    expect(track.phases.map((phase) => phase.kind)).toEqual(['outbound', 'destination', 'return']);
    const destination = track.phases[1];
    expect(destination.endFrame - destination.startFrame).toBeGreaterThanOrEqual(5 * config.output.fps);
    expect(track.durationInFrames).toBeGreaterThan(10 * config.output.fps);
  });
});
