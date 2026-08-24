import type {PlaybackPoint} from './playback';
import {haversineDistance} from './geo';
import {MOTION} from './motion-constants';

type ProjectedPoint = {x: number; y: number};

const latitudeToY = (latitude: number) => {
  const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
};

const project = (points: PlaybackPoint[]) => {
  let previousX = (points[0].longitude + 180) / 360;
  return points.map((point, index) => {
    let x = (point.longitude + 180) / 360;
    if (index > 0) {
      while (x - previousX > 0.5) x -= 1;
      while (x - previousX < -0.5) x += 1;
    }
    previousX = x;
    return {x, y: latitudeToY(point.latitude)};
  });
};

const squaredSegmentDistance = (point: ProjectedPoint, from: ProjectedPoint, to: ProjectedPoint) => {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (deltaX === 0 && deltaY === 0) return (point.x - from.x) ** 2 + (point.y - from.y) ** 2;
  const progress = Math.max(0, Math.min(1, ((point.x - from.x) * deltaX + (point.y - from.y) * deltaY) / (deltaX ** 2 + deltaY ** 2)));
  const x = from.x + progress * deltaX;
  const y = from.y + progress * deltaY;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
};

const isHardBreak = (points: PlaybackPoint[], index: number) => {
  if (!points[index].breakBefore || index === 0) return false;
  const distanceKm = haversineDistance(points[index - 1], points[index]) / 1000;
  const isFlight = points[index].activity === 'flying' || points[index - 1].activity === 'flying';
  return distanceKm >= MOTION.playback.journeyDistanceThresholdKm || (isFlight && distanceKm >= MOTION.playback.journeyFlyingEdgeMinimumKm);
};

const simplifyRange = (projected: ProjectedPoint[], start: number, end: number, toleranceSquared: number, keep: Set<number>) => {
  const stack: Array<[number, number]> = [[start, end]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let farthestIndex = -1;
    let farthestDistance = toleranceSquared;
    for (let index = from + 1; index < to; index += 1) {
      const distance = squaredSegmentDistance(projected[index], projected[from], projected[to]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex >= 0) {
      keep.add(farthestIndex);
      stack.push([from, farthestIndex], [farthestIndex, to]);
    }
  }
};

const simplifyAtTolerance = (points: PlaybackPoint[], projected: ProjectedPoint[], tolerance: number) => {
  const anchors = new Set([0, points.length - 1]);
  points.forEach((_, index) => {
    if (!isHardBreak(points, index)) return;
    anchors.add(index);
    anchors.add(Math.max(0, index - 1));
  });
  const orderedAnchors = [...anchors].sort((a, b) => a - b);
  const keep = new Set(orderedAnchors);
  for (let index = 1; index < orderedAnchors.length; index += 1) {
    simplifyRange(projected, orderedAnchors[index - 1], orderedAnchors[index], tolerance ** 2, keep);
  }
  return [...keep].sort((a, b) => a - b).map((index) => {
    const point = points[index];
    return !point.breakBefore || isHardBreak(points, index) ? point : {...point, breakBefore: false};
  });
};

export const simplifyPlaybackTrack = (points: PlaybackPoint[], maximum = 5000) => {
  if (points.length <= maximum || points.length < 3) return points;
  const projected = project(points);
  let low = 0;
  let high = 1;
  while (simplifyAtTolerance(points, projected, high).length > maximum && high < 1_048_576) high *= 2;
  let result = points;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const tolerance = (low + high) / 2;
    const candidate = simplifyAtTolerance(points, projected, tolerance);
    if (candidate.length > maximum) low = tolerance;
    else {
      high = tolerance;
      result = candidate;
    }
  }
  return result;
};
