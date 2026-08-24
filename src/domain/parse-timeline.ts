import {haversineDistance} from './geo';
import type {NormalizedTimeline, TrackPoint} from './timeline';

type RawRecord = {
  startTime?: string;
  endTime?: string;
  activity?: {
    start?: string;
    end?: string;
    topCandidate?: {type?: string};
  };
  timelinePath?: Array<{point?: string; durationMinutesOffsetFromStartTime?: string}>;
  visit?: {topCandidate?: {placeLocation?: string}};
  timelineMemory?: unknown;
};

type PointDraft = Omit<TrackPoint, 'id' | 'breakBefore' | 'cumulativeDistanceMeters'>;

export type TimelineParseErrorCode = 'invalid-json' | 'unsupported-format' | 'no-coordinates';

export class TimelineParseError extends Error {
  constructor(public readonly code: TimelineParseErrorCode) {
    super(code);
    this.name = 'TimelineParseError';
  }
}

const parseLocation = (value?: string) => {
  if (!value) return null;
  const match = value.match(/^geo:([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {latitude, longitude};
};

const timezoneOffset = (value: string) => {
  if (value.endsWith('Z')) return 0;
  const match = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
};

const validTimestamp = (value?: string) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart <= bEnd && bStart <= aEnd;

const fallbackHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `local-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const parseTimeline = (rawText: string, sourceName = 'location-history.json', suppliedHash?: string): NormalizedTimeline => {
  let raw: unknown;
  try { raw = JSON.parse(rawText) as unknown; }
  catch { throw new TimelineParseError('invalid-json'); }
  const records = Array.isArray(raw)
    ? raw as RawRecord[]
    : raw && typeof raw === 'object' && Array.isArray((raw as {semanticSegments?: unknown}).semanticSegments)
      ? (raw as {semanticSegments: RawRecord[]}).semanticSegments
      : null;
  if (!records) throw new TimelineParseError('unsupported-format');
  const sourceHash = suppliedHash ?? fallbackHash(rawText);
  let invalidPointCount = 0;
  let totalPathPoints = 0;

  const activities = records.flatMap((record) => {
    if (!record.activity) return [];
    const start = validTimestamp(record.startTime);
    const end = validTimestamp(record.endTime);
    if (start === null || end === null) return [];
    return [{start, end, activity: record.activity.topCandidate?.type ?? 'unknown'}];
  });
  const pathIntervals = records.flatMap((record) => {
    if (!record.timelinePath) return [];
    const start = validTimestamp(record.startTime);
    const end = validTimestamp(record.endTime);
    return start === null || end === null ? [] : [{start, end}];
  });

  const drafts: Array<{start: number; end: number; points: PointDraft[]}> = [];

  for (const record of records) {
    const start = validTimestamp(record.startTime);
    const end = validTimestamp(record.endTime);
    if (start === null || end === null) continue;
    const offset = timezoneOffset(record.startTime!);

    if (record.timelinePath) {
      totalPathPoints += record.timelinePath.length;
      const midpoint = start + (end - start) / 2;
      const activity =
        activities.find((candidate) => overlaps(start, end, candidate.start, candidate.end))?.activity ??
        activities.find((candidate) => midpoint >= candidate.start && midpoint <= candidate.end)?.activity ??
        'unknown';
      const points = record.timelinePath.flatMap((pathPoint): PointDraft[] => {
        const location = parseLocation(pathPoint.point);
        const minutes = Number(pathPoint.durationMinutesOffsetFromStartTime ?? 0);
        if (!location || !Number.isFinite(minutes)) {
          invalidPointCount += 1;
          return [];
        }
        return [{
          ...location,
          timestamp: start + minutes * 60_000,
          timezoneOffsetMinutes: offset,
          activity,
          kind: 'path',
        }];
      });
      if (points.length) drafts.push({start, end, points});
      continue;
    }

    if (record.activity) {
      if (pathIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))) continue;
      const startLocation = parseLocation(record.activity.start);
      const endLocation = parseLocation(record.activity.end);
      const activity = record.activity.topCandidate?.type ?? 'unknown';
      const points: PointDraft[] = [];
      if (startLocation) points.push({...startLocation, timestamp: start, timezoneOffsetMinutes: offset, activity, kind: 'activity'});
      else invalidPointCount += 1;
      if (endLocation) points.push({...endLocation, timestamp: end, timezoneOffsetMinutes: offset, activity, kind: 'activity'});
      else invalidPointCount += 1;
      if (points.length) drafts.push({start, end, points});
      continue;
    }

    if (record.visit) {
      const location = parseLocation(record.visit.topCandidate?.placeLocation);
      if (!location) {
        invalidPointCount += 1;
        continue;
      }
      drafts.push({
        start,
        end,
        points: [
          {...location, timestamp: start, timezoneOffsetMinutes: offset, activity: 'visit', kind: 'visit'},
          {...location, timestamp: end, timezoneOffsetMinutes: offset, activity: 'visit', kind: 'visit'},
        ],
      });
    }
  }

  const points: TrackPoint[] = [];
  let cumulativeDistanceMeters = 0;
  let previous: TrackPoint | undefined;

  const candidates = drafts.flatMap((draft) => draft.points
    .toSorted((a, b) => a.timestamp - b.timestamp)
    .map((candidate, index) => ({candidate, recordStart: draft.start, isRecordStart: index === 0})))
    .toSorted((a, b) => a.candidate.timestamp - b.candidate.timestamp || a.recordStart - b.recordStart);

  for (const {candidate, isRecordStart} of candidates) {
    const distance = previous ? haversineDistance(previous, candidate) : 0;
    const elapsed = previous ? candidate.timestamp - previous.timestamp : 0;
    const recordBoundaryBreak = isRecordStart && distance > 5_000;
    const breakBefore = Boolean(
      previous &&
        (recordBoundaryBreak || (elapsed === 0 && distance > 10) || elapsed > 12 * 60 * 60 * 1000 || (distance > 200_000 && candidate.activity !== 'flying')),
    );
    if (previous && !breakBefore && distance > 1) cumulativeDistanceMeters += distance;
    const point: TrackPoint = {
      ...candidate,
      id: `${candidate.timestamp}-${points.length}`,
      breakBefore,
      cumulativeDistanceMeters,
    };
    const duplicate =
      previous &&
      previous.timestamp === point.timestamp &&
      haversineDistance(previous, point) < 2;
    if (!duplicate) {
      points.push(point);
      previous = point;
    }
  }

  if (!points.length) throw new TimelineParseError('no-coordinates');
  const startTime = new Date(points[0].timestamp).toISOString();
  const endTime = new Date(points.at(-1)!.timestamp).toISOString();

  return {
    summary: {
      sourceName,
      sourceHash,
      startTime,
      endTime,
      totalSegments: records.length,
      totalPathPoints,
      activityCount: records.filter((record) => Boolean(record.activity)).length,
      visitCount: records.filter((record) => Boolean(record.visit)).length,
      pathCount: records.filter((record) => Boolean(record.timelinePath)).length,
      ignoredCount: records.filter((record) => Boolean(record.timelineMemory)).length,
      invalidPointCount,
      distanceMeters: cumulativeDistanceMeters,
    },
    points,
  };
};
