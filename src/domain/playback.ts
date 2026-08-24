import {bearingBetween, haversineDistance} from './geo';
import type {TrackPoint, VideoConfig} from './timeline';
import {MOTION} from './motion-constants';

export type PlaybackPoint = TrackPoint & {frame: number};
export type JourneyPhaseKind = 'routine' | 'outbound' | 'destination' | 'return' | 'transition';
export type PlaybackPhase = {
  kind: JourneyPhaseKind;
  startPointIndex: number;
  endPointIndex: number;
  startFrame: number;
  endFrame: number;
  distanceMeters: number;
  actualDurationMs: number;
  minimumSeconds: number;
};
export type PlaybackTrack = {points: PlaybackPoint[]; durationInFrames: number; phases: PlaybackPhase[]};
type PhaseDraft = Omit<PlaybackPhase, 'startFrame' | 'endFrame'>;

const cinematicDelta = (previous: TrackPoint, current: TrackPoint, distanceInfluence: number) => {
  const seconds = Math.max(0, (current.timestamp - previous.timestamp) / 1000);
  const minutes = seconds / 60;
  const distanceMeters = haversineDistance(previous, current);
  const distanceKm = distanceMeters / 1000;
  const distanceScore = distanceKm ** (current.breakBefore ? MOTION.playback.gapDistanceExponent : MOTION.playback.movementDistanceExponent);
  const timeScore = Math.log1p(minutes);
  if (previous.kind === 'visit' || current.kind === 'visit') return Math.max(0.001, distanceInfluence * distanceScore * 0.15 + (1 - distanceInfluence * 0.5) * MOTION.playback.visitTimeWeight * timeScore);
  if (current.breakBefore) return Math.max(0.001, distanceInfluence * MOTION.playback.gapDistanceWeight * distanceScore + (1 - distanceInfluence) * MOTION.playback.gapTimeWeight * Math.log1p(seconds / 86_400));
  return Math.max(0.001, distanceInfluence * MOTION.playback.movementDistanceWeight * distanceScore + (1 - distanceInfluence) * MOTION.playback.movementTimeWeight * timeScore);
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const smootherstep = (value: number) => value ** 3 * (value * (value * 6 - 15) + 10);
const unwrapLongitude = (value: number, reference: number) => {
  let result = value;
  while (result - reference > 180) result -= 360;
  while (result - reference < -180) result += 360;
  return result;
};

const interpolateGreatCircle = (from: TrackPoint, to: TrackPoint, progress: number) => {
  const toRadians = (value: number) => value * Math.PI / 180;
  const fromLatitude = toRadians(from.latitude);
  const fromLongitude = toRadians(from.longitude);
  const toLatitude = toRadians(to.latitude);
  const toLongitude = toRadians(to.longitude);
  const fromVector = [Math.cos(fromLatitude) * Math.cos(fromLongitude), Math.cos(fromLatitude) * Math.sin(fromLongitude), Math.sin(fromLatitude)];
  const toVector = [Math.cos(toLatitude) * Math.cos(toLongitude), Math.cos(toLatitude) * Math.sin(toLongitude), Math.sin(toLatitude)];
  const angle = Math.acos(clamp(fromVector[0] * toVector[0] + fromVector[1] * toVector[1] + fromVector[2] * toVector[2], -1, 1));
  if (angle < 1e-7) return {latitude: from.latitude, longitude: from.longitude};
  const denominator = Math.sin(angle);
  const fromWeight = Math.sin((1 - progress) * angle) / denominator;
  const toWeight = Math.sin(progress * angle) / denominator;
  const x = fromVector[0] * fromWeight + toVector[0] * toWeight;
  const y = fromVector[1] * fromWeight + toVector[1] * toWeight;
  const z = fromVector[2] * fromWeight + toVector[2] * toWeight;
  return {latitude: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, longitude: Math.atan2(y, x) * 180 / Math.PI};
};

const hermite = (before: number, from: number, to: number, after: number, progress: number) => {
  const progress2 = progress * progress;
  const progress3 = progress2 * progress;
  const delta = to - from;
  if (Math.abs(delta) < 1e-12) return from;
  let fromTangent = (to - before) * 0.5;
  let toTangent = (after - from) * 0.5;
  let alpha = fromTangent / delta;
  let beta = toTangent / delta;
  if (alpha < 0) {
    fromTangent = 0;
    alpha = 0;
  }
  if (beta < 0) {
    toTangent = 0;
    beta = 0;
  }
  const magnitude = Math.hypot(alpha, beta);
  if (magnitude > 3) {
    const scale = 3 / magnitude;
    fromTangent = scale * alpha * delta;
    toTangent = scale * beta * delta;
  }
  return (2 * progress3 - 3 * progress2 + 1) * from + (progress3 - 2 * progress2 + progress) * fromTangent + (-2 * progress3 + 3 * progress2) * to + (progress3 - progress2) * toTangent;
};

const interpolatePosition = (points: PlaybackPoint[], index: number, progress: number) => {
  const from = points[index];
  const to = points[Math.min(index + 1, points.length - 1)];
  if (to.breakBefore) return interpolateGreatCircle(from, to, smootherstep(progress));
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 2)];
  const beforeLongitude = unwrapLongitude(before.longitude, from.longitude);
  const toLongitude = unwrapLongitude(to.longitude, from.longitude);
  const afterLongitude = unwrapLongitude(after.longitude, toLongitude);
  const latitude = hermite(before.latitude, from.latitude, to.latitude, after.latitude, progress);
  const longitude = hermite(beforeLongitude, from.longitude, toLongitude, afterLongitude, progress);
  const latitudePadding = Math.abs(to.latitude - from.latitude) * 0.15 + 0.0001;
  return {
    latitude: clamp(latitude, Math.min(from.latitude, to.latitude) - latitudePadding, Math.max(from.latitude, to.latitude) + latitudePadding),
    longitude: ((longitude + 540) % 360) - 180,
  };
};

export const filterLocationSpikes = (points: TrackPoint[]) => points.filter((point, index) => {
  if (index === 0 || index === points.length - 1) return true;
  const before = points[index - 1];
  const after = points[index + 1];
  const elapsed = after.timestamp - before.timestamp;
  if (elapsed <= 0 || elapsed > 20 * 60_000) return true;
  const direct = haversineDistance(before, after);
  const incoming = haversineDistance(before, point);
  const outgoing = haversineDistance(point, after);
  const isSpike = direct < 300 && incoming > 2_000 && outgoing > 2_000 && incoming + outgoing > Math.max(8_000, direct * 8);
  return !isSpike;
});

const phaseDraft = (points: TrackPoint[], kind: JourneyPhaseKind, startPointIndex: number, endPointIndex: number, minimumSeconds: number): PhaseDraft => {
  let distanceMeters = 0;
  for (let index = startPointIndex + 1; index <= endPointIndex; index += 1) distanceMeters += haversineDistance(points[index - 1], points[index]);
  return {
    kind,
    startPointIndex,
    endPointIndex,
    distanceMeters,
    actualDurationMs: Math.max(0, points[endPointIndex].timestamp - points[startPointIndex].timestamp),
    minimumSeconds,
  };
};

const travelMinimumSeconds = (distanceMeters: number) => clamp(
  MOTION.playback.travelMinimumSecondsBase + MOTION.playback.travelMinimumSecondsLogWeight * Math.log1p(distanceMeters / 500_000),
  MOTION.playback.travelMinimumSecondsBase,
  MOTION.playback.travelMinimumSecondsMaximum,
);

export const detectJourneyPhases = (points: TrackPoint[], config: VideoConfig): PhaseDraft[] => {
  if (points.length < 2) return [];
  const edgeCount = points.length - 1;
  const travelEdges = Array.from({length: edgeCount}, (_, index) => {
    const distanceKm = haversineDistance(points[index], points[index + 1]) / 1000;
    const flying = points[index].activity === 'flying' || points[index + 1].activity === 'flying';
    return distanceKm >= MOTION.playback.journeyDistanceThresholdKm || (flying && distanceKm >= MOTION.playback.journeyFlyingEdgeMinimumKm);
  });
  const legs: Array<{startPointIndex: number; endPointIndex: number}> = [];
  let edge = 0;
  while (edge < edgeCount) {
    if (!travelEdges[edge]) {
      edge += 1;
      continue;
    }
    const startPointIndex = edge;
    let lastTravelEdge = edge;
    let search = edge + 1;
    while (search < edgeCount) {
      const nextTravelEdge = travelEdges.findIndex((travel, index) => index >= search && travel);
      if (nextTravelEdge < 0) break;
      const separationHours = (points[nextTravelEdge].timestamp - points[lastTravelEdge + 1].timestamp) / 3_600_000;
      if (separationHours > MOTION.playback.journeyLegMergeHours) break;
      lastTravelEdge = nextTravelEdge;
      search = nextTravelEdge + 1;
    }
    legs.push({startPointIndex, endPointIndex: lastTravelEdge + 1});
    edge = lastTravelEdge + 1;
  }
  const phases: PhaseDraft[] = [];
  let cursor = 0;
  let legIndex = 0;
  while (cursor < edgeCount) {
    const outboundLeg = legs[legIndex];
    if (!outboundLeg) {
      phases.push(phaseDraft(points, 'routine', cursor, edgeCount, phases.at(-1)?.kind === 'return' ? MOTION.playback.journeyRecoverySeconds : 0));
      break;
    }
    if (outboundLeg.startPointIndex < cursor) {
      legIndex += 1;
      continue;
    }
    if (outboundLeg.startPointIndex > cursor) phases.push(phaseDraft(points, 'routine', cursor, outboundLeg.startPointIndex, phases.at(-1)?.kind === 'return' ? MOTION.playback.journeyRecoverySeconds : 0));
    const origin = points[outboundLeg.startPointIndex];
    const outboundDistance = haversineDistance(origin, points[outboundLeg.endPointIndex]);
    let returnLegIndex = -1;
    for (let candidate = legIndex + 1; candidate < legs.length; candidate += 1) {
      const returnLeg = legs[candidate];
      const tripDays = (points[returnLeg.endPointIndex].timestamp - origin.timestamp) / 86_400_000;
      if (tripDays > MOTION.playback.journeyMaximumDays) break;
      const returnRadius = Math.max(MOTION.playback.journeyReturnRadiusMinimumKm * 1000, outboundDistance * MOTION.playback.journeyReturnRadiusRatio);
      if (haversineDistance(points[returnLeg.endPointIndex], origin) <= returnRadius) {
        returnLegIndex = candidate;
        break;
      }
    }
    if (returnLegIndex > legIndex) {
      const returnLeg = legs[returnLegIndex];
      phases.push(phaseDraft(points, 'outbound', outboundLeg.startPointIndex, outboundLeg.endPointIndex, travelMinimumSeconds(outboundDistance)));
      if (returnLeg.startPointIndex > outboundLeg.endPointIndex) phases.push(phaseDraft(points, 'destination', outboundLeg.endPointIndex, returnLeg.startPointIndex, config.playback.destinationHoldSeconds));
      const returnDistance = haversineDistance(points[returnLeg.startPointIndex], points[returnLeg.endPointIndex]);
      phases.push(phaseDraft(points, 'return', returnLeg.startPointIndex, returnLeg.endPointIndex, travelMinimumSeconds(returnDistance)));
      cursor = returnLeg.endPointIndex;
      legIndex = returnLegIndex + 1;
    } else {
      phases.push(phaseDraft(points, 'transition', outboundLeg.startPointIndex, outboundLeg.endPointIndex, travelMinimumSeconds(outboundDistance)));
      cursor = outboundLeg.endPointIndex;
      legIndex += 1;
    }
  }
  return phases;
};

const journeyMinimumSeconds = (points: TrackPoint[], config: VideoConfig) =>
  detectJourneyPhases(points, config).reduce((total, phase) => total + phase.minimumSeconds, 0);

const allocateCinematicFrames = (points: TrackPoint[], durationInFrames: number, config: VideoConfig) => {
  const drafts = detectJourneyPhases(points, config);
  const phaseScores = drafts.map((phase) => {
    let score = 0;
    for (let index = phase.startPointIndex + 1; index <= phase.endPointIndex; index += 1) score += cinematicDelta(points[index - 1], points[index], config.playback.distanceInfluence);
    return Math.max(0.001, score);
  });
  const requestedMinimumFrames = drafts.map((phase) => phase.minimumSeconds * config.output.fps);
  const availableFrames = Math.max(0, durationInFrames - 1);
  const requestedMinimumTotal = requestedMinimumFrames.reduce((sum, value) => sum + value, 0);
  const minimumScale = requestedMinimumTotal > availableFrames ? availableFrames / requestedMinimumTotal : 1;
  const minimumFrames = requestedMinimumFrames.map((value) => value * minimumScale);
  const totalMinimumFrames = minimumFrames.reduce((sum, value) => sum + value, 0);
  const remainingFrames = Math.max(0, availableFrames - totalMinimumFrames);
  const totalScore = phaseScores.reduce((sum, value) => sum + value, 0) || 1;
  const budgets = drafts.map((_, index) => minimumFrames[index] + remainingFrames * phaseScores[index] / totalScore);
  const playbackPoints: PlaybackPoint[] = points.map((point) => ({...point, frame: 0}));
  const phases: PlaybackPhase[] = [];
  let exactCursor = 0;

  drafts.forEach((phase, phaseIndex) => {
    const startFrame = Math.round(exactCursor);
    exactCursor += budgets[phaseIndex];
    const endFrame = phaseIndex === drafts.length - 1 ? durationInFrames - 1 : Math.round(exactCursor);
    const edgeWeights: number[] = [];
    for (let index = phase.startPointIndex + 1; index <= phase.endPointIndex; index += 1) edgeWeights.push(cinematicDelta(points[index - 1], points[index], config.playback.distanceInfluence));
    const edgeTotal = edgeWeights.reduce((sum, value) => sum + value, 0) || 1;
    let cumulativeWeight = 0;
    playbackPoints[phase.startPointIndex].frame = startFrame;
    edgeWeights.forEach((weight, edgeOffset) => {
      cumulativeWeight += weight;
      playbackPoints[phase.startPointIndex + edgeOffset + 1].frame = Math.round(startFrame + (endFrame - startFrame) * cumulativeWeight / edgeTotal);
    });
    phases.push({...phase, startFrame, endFrame});
  });
  return {points: playbackPoints, phases};
};

export const resolvePlaybackDuration = (allPoints: TrackPoint[], config: VideoConfig) => {
  const points = filterLocationSpikes(allPoints.filter((point) => point.timestamp >= config.range.start && point.timestamp <= config.range.end));
  if (points.length < 2) return 10;
  if (config.playback.mode === 'fixed-duration') return config.playback.durationSeconds;
  const activeDays = new Set(points.map((point) => Math.floor(point.timestamp / 86_400_000))).size;
  let distanceMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (!points[index].breakBefore) distanceMeters += haversineDistance(points[index - 1], points[index]);
  }
  const distanceKm = distanceMeters / 1000;
  const baseDuration = MOTION.playback.cinematicBaseSeconds + MOTION.playback.activeDayLogWeight * Math.log1p(activeDays) + MOTION.playback.distanceLogWeight * Math.log1p(distanceKm / MOTION.playback.distanceScaleKm);
  const minimumJourneyDuration = journeyMinimumSeconds(points, config);
  return Math.max(minimumJourneyDuration, clamp(baseDuration * config.playback.cinematicDensity, MOTION.playback.minimumDynamicSeconds, MOTION.playback.maximumCinematicSeconds));
};

export const buildPlaybackTrack = (allPoints: TrackPoint[], config: VideoConfig): PlaybackTrack => {
  const selected = filterLocationSpikes(allPoints.filter(
    (point) => point.timestamp >= config.range.start && point.timestamp <= config.range.end,
  ));
  let playbackDistanceMeters = 0;
  const points = selected.map((point, index) => {
    if (index > 0) playbackDistanceMeters += haversineDistance(selected[index - 1], point);
    return {...point, cumulativeDistanceMeters: playbackDistanceMeters};
  });
  const durationInFrames = Math.max(1, Math.round(resolvePlaybackDuration(allPoints, config) * config.output.fps));
  if (points.length < 2) return {points: points.map((point) => ({...point, frame: 0})), durationInFrames, phases: []};

  const allocated = allocateCinematicFrames(points, durationInFrames, config);
  return {durationInFrames, ...allocated};
};

export const samplePlayback = (track: PlaybackTrack, frame: number) => {
  if (!track.points.length) return null;
  if (frame <= 0) return {point: track.points[0], bearing: 0, progress: 0, isPredictedGap: false};
  let low = 0;
  let high = track.points.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (track.points[middle].frame <= frame) low = middle;
    else high = middle - 1;
  }
  const current = track.points[low];
  const next = track.points[Math.min(low + 1, track.points.length - 1)];
  if (next === current || next.frame === current.frame) {
    return {point: current, bearing: low > 0 ? bearingBetween(track.points[low - 1], current) : 0, progress: low / Math.max(1, track.points.length - 1), isPredictedGap: false};
  }
  const amount = Math.min(1, Math.max(0, (frame - current.frame) / (next.frame - current.frame)));
  const position = interpolatePosition(track.points, low, amount);
  const aheadPosition = interpolatePosition(track.points, low, Math.min(1, amount + 0.015));
  return {
    point: {
      ...current,
      ...position,
      timestamp: current.timestamp + (next.timestamp - current.timestamp) * amount,
      cumulativeDistanceMeters:
        current.cumulativeDistanceMeters +
        (next.cumulativeDistanceMeters - current.cumulativeDistanceMeters) * amount,
    },
    bearing: bearingBetween({...current, ...position}, {...next, ...aheadPosition}),
    progress: (low + amount) / Math.max(1, track.points.length - 1),
    isPredictedGap: next.breakBefore,
  };
};
