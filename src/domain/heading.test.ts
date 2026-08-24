import {describe, expect, it} from 'vitest';
import {buildHeadingTrack} from './heading';
import {buildPlaybackTrack} from './playback';
import {defaultVideoConfig, type TrackPoint} from './timeline';

const point = (timestamp: number, latitude: number, longitude: number, activity = 'walking'): TrackPoint => ({id: String(timestamp), timestamp, latitude, longitude, activity, timezoneOffsetMinutes: 0, kind: 'path', breakBefore: false, cumulativeDistanceMeters: 0});

describe('activity marker heading', () => {
  it('follows future course without a 0/360 discontinuity', () => {
    const config = defaultVideoConfig(0, 10_000);
    config.playback.mode = 'fixed-duration'; config.playback.durationSeconds = 10;
    const track = buildPlaybackTrack([point(0, 0, -0.01), point(5_000, 0.1, 0), point(10_000, 0.2, 0.01)], config);
    const values = buildHeadingTrack(track, 30);
    expect(values).toHaveLength(track.durationInFrames);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(Math.max(...values.slice(1).map((value, index) => Math.abs((((value - values[index]) + 540) % 360) - 180)))).toBeLessThan(15);
  });

  it('holds a stable direction during stationary jitter', () => {
    const config = defaultVideoConfig(0, 10_000);
    config.playback.mode = 'fixed-duration'; config.playback.durationSeconds = 10;
    const track = buildPlaybackTrack([point(0, 37, 127, 'visit'), point(5_000, 37.000001, 127.000001, 'visit'), point(10_000, 37.000002, 127, 'visit')], config);
    const values = buildHeadingTrack(track, 30);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1);
  });
});
