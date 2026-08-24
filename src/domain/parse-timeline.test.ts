import {describe, expect, it} from 'vitest';
import {parseTimeline, TimelineParseError} from './parse-timeline';

describe('parseTimeline', () => {
  it('accepts the older semanticSegments root shape', () => {
    const raw = JSON.stringify({semanticSegments: [{startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-01T01:00:00Z', visit: {topCandidate: {placeLocation: 'geo:37.5,127'}}}]});
    expect(parseTimeline(raw).points).toHaveLength(2);
  });

  it('normalizes path, activity and visit records without exposing a false connecting line', () => {
    const timeline = parseTimeline(JSON.stringify([
      {
        startTime: '2025-01-01T09:00:00+09:00',
        endTime: '2025-01-01T09:10:00+09:00',
        activity: {start: 'geo:37.5,127', end: 'geo:37.51,127.01', topCandidate: {type: 'walking'}},
      },
      {
        startTime: '2025-01-01T09:00:00+09:00',
        endTime: '2025-01-01T09:10:00+09:00',
        timelinePath: [
          {point: 'geo:37.5,127', durationMinutesOffsetFromStartTime: '0'},
          {point: 'geo:37.51,127.01', durationMinutesOffsetFromStartTime: '10'},
        ],
      },
      {
        startTime: '2025-01-02T10:00:00+09:00',
        endTime: '2025-01-02T11:00:00+09:00',
        visit: {topCandidate: {placeLocation: 'geo:35.1,129.0'}},
      },
    ]));

    expect(timeline.summary).toMatchObject({totalSegments: 3, activityCount: 1, pathCount: 1, visitCount: 1, invalidPointCount: 0});
    expect(timeline.points.some((point) => point.activity === 'walking' && point.kind === 'path')).toBe(true);
    expect(timeline.points.some((point) => point.kind === 'activity')).toBe(false);
    expect(timeline.points.find((point) => point.kind === 'visit')?.breakBefore).toBe(true);
    expect(timeline.points[0].timezoneOffsetMinutes).toBe(540);
  });

  it('rejects unsupported and coordinate-free data', () => {
    const codeOf = (parse: () => unknown) => {
      try { parse(); }
      catch (error) {
        expect(error).toBeInstanceOf(TimelineParseError);
        return (error as TimelineParseError).code;
      }
      throw new Error('Expected TimelineParseError');
    };
    expect(codeOf(() => parseTimeline('{'))).toBe('invalid-json');
    expect(codeOf(() => parseTimeline('{}'))).toBe('unsupported-format');
    expect(codeOf(() => parseTimeline(JSON.stringify([{startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-01T01:00:00Z', visit: {topCandidate: {placeLocation: 'invalid'}}}])))).toBe('no-coordinates');
  });

  it('globally orders coordinates from overlapping records', () => {
    const timeline = parseTimeline(JSON.stringify([
      {
        startTime: '2025-01-01T09:00:00Z',
        endTime: '2025-01-01T12:00:00Z',
        timelinePath: [
          {point: 'geo:37.5,127', durationMinutesOffsetFromStartTime: '0'},
          {point: 'geo:37.6,127.1', durationMinutesOffsetFromStartTime: '180'},
        ],
      },
      {
        startTime: '2025-01-01T10:00:00Z',
        endTime: '2025-01-01T11:00:00Z',
        visit: {topCandidate: {placeLocation: 'geo:37.55,127.05'}},
      },
    ]));
    expect(timeline.points.every((value, index) => index === 0 || value.timestamp >= timeline.points[index - 1].timestamp)).toBe(true);
    expect(timeline.points.map((value) => new Date(value.timestamp).getUTCHours())).toEqual([9, 10, 11, 12]);
  });
});
