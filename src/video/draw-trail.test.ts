import {describe, expect, it} from 'vitest';
import {trailSegment, type ScreenTrailPoint} from './draw-trail';

const point = (x: number, y: number, breakBefore = false): ScreenTrailPoint => ({x, y, breakBefore, frame: x, color: '#fff', curveSign: 1});

describe('trailSegment', () => {
  it('keeps normal segments continuous with a cubic curve', () => {
    const segment = trailSegment([point(0, 0), point(10, 10), point(20, 0)], 1);
    expect(segment.kind).toBe('cubic');
    expect(segment.from).toMatchObject({x: 0, y: 0});
    expect(segment.to).toMatchObject({x: 10, y: 10});
  });

  it('bridges a data gap with a curved arc instead of dropping the segment', () => {
    const segment = trailSegment([point(0, 0), point(100, 0, true)], 1);
    expect(segment.kind).toBe('arc');
    if (segment.kind === 'arc') expect(segment.cy).not.toBe(0);
  });
});
