import {describe, expect, it} from 'vitest';
import type {PlaybackPoint} from './playback';
import {simplifyPlaybackTrack} from './track-simplification';

const point = (index: number, latitude: number, longitude: number, breakBefore = false): PlaybackPoint => ({
  id: `${index}`,
  frame: index,
  timestamp: index * 1000,
  latitude,
  longitude,
  breakBefore,
  timezoneOffsetMinutes: 0,
  activity: 'walking',
  kind: 'path',
  cumulativeDistanceMeters: index,
});

describe('playback trail simplification', () => {
  it('retains bends and explicit gap boundaries under a point budget', () => {
    const points = Array.from({length: 10_001}, (_, index) => {
      const longitude = index < 7500 ? index / 1000 : 10 + index / 1000;
      const latitude = index === 5000 ? 1 : Math.sin(index / 120) * 0.002;
      return point(index, latitude, longitude, index === 7500);
    });
    const simplified = simplifyPlaybackTrack(points, 120);
    expect(simplified.length).toBeLessThanOrEqual(120);
    expect(simplified[0]).toBe(points[0]);
    expect(simplified.at(-1)).toBe(points.at(-1));
    expect(simplified).toContain(points[5000]);
    expect(simplified).toContain(points[7499]);
    expect(simplified).toContain(points[7500]);
  });

  it('unwraps the date line before measuring geometric error', () => {
    const points = [point(0, 0, 179), point(1, 0, 179.5), point(2, 0, -180), point(3, 0, -179.5), point(4, 0, -179)];
    const simplified = simplifyPlaybackTrack(points, 2);
    expect(simplified).toEqual([points[0], points[4]]);
  });
});
