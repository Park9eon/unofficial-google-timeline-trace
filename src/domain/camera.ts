import {MOTION} from './motion-constants';
import {haversineDistance} from './geo';
import {samplePlayback, type PlaybackPhase, type PlaybackPoint, type PlaybackTrack} from './playback';
import {outputDimensions, type VideoConfig} from './timeline';
import {interpolateZoom} from 'd3-interpolate';

export type CameraFrame = {latitude: number; longitude: number; zoom: number};
type MercatorCameraTarget = {x: number; y: number; zoom: number};
type CameraConfig = Pick<VideoConfig, 'camera' | 'output'>;
type PredictionStats = {distanceReference: number; speedReference: number; pinIndices: number[]};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const smoothstep = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const hermite = (from: number, to: number, fromVelocity: number, toVelocity: number, duration: number, progress: number) => {
  const squared = progress * progress;
  const cubed = squared * progress;
  return (2 * cubed - 3 * squared + 1) * from
    + (cubed - 2 * squared + progress) * fromVelocity * duration
    + (-2 * cubed + 3 * squared) * to
    + (cubed - squared) * toVelocity * duration;
};
const knotVelocities = (values: number[], frames: number[], settledFrames: Set<number>, scale: number) => values.map((_, index) => {
  if (index === 0 || index === values.length - 1 || settledFrames.has(frames[index])) return 0;
  const elapsedFrames = Math.max(1, frames[index + 1] - frames[index - 1]);
  return (values[index + 1] - values[index - 1]) / elapsedFrames * scale;
});
const longitudeToX = (longitude: number) => (longitude + 180) / 360;
const latitudeToY = (latitude: number) => {
  const radians = clamp(latitude, -85.05112878, 85.05112878) * Math.PI / 180;
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
};
const xToLongitude = (x: number) => ((x * 360 % 360) + 360) % 360 - 180;
const yToLatitude = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
const unwrapX = (x: number, reference: number) => {
  let result = x;
  while (result - reference > 0.5) result -= 1;
  while (result - reference < -0.5) result += 1;
  return result;
};

export const fixedCameraBounds = (points: Array<Pick<PlaybackPoint, 'latitude' | 'longitude'>>) => {
  if (!points.length) return [[-180, -85], [180, 85]] as [[number, number], [number, number]];
  let previousLongitude = points[0].longitude;
  let minimumLongitude = previousLongitude;
  let maximumLongitude = previousLongitude;
  let minimumLatitude = points[0].latitude;
  let maximumLatitude = points[0].latitude;
  for (let index = 1; index < points.length; index += 1) {
    let longitude = points[index].longitude;
    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;
    previousLongitude = longitude;
    minimumLongitude = Math.min(minimumLongitude, longitude);
    maximumLongitude = Math.max(maximumLongitude, longitude);
    minimumLatitude = Math.min(minimumLatitude, points[index].latitude);
    maximumLatitude = Math.max(maximumLatitude, points[index].latitude);
  }
  return [[minimumLongitude, minimumLatitude], [maximumLongitude, maximumLatitude]] as [[number, number], [number, number]];
};

const lowerBoundFrame = (points: PlaybackPoint[], frame: number) => {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].frame < frame) low = middle + 1;
    else high = middle;
  }
  return low;
};

const phaseAtFrame = (track: PlaybackTrack, frame: number) =>
  track.phases.find((phase) => frame >= phase.startFrame && frame <= phase.endFrame) ?? track.phases.at(-1);

const phaseProgress = (phase: PlaybackPhase | undefined, frame: number) =>
  phase ? clamp((frame - phase.startFrame) / Math.max(1, phase.endFrame - phase.startFrame), 0, 1) : 0;

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
};

const buildPredictionStats = (track: PlaybackTrack, fps: number): PredictionStats => {
  const distances: number[] = [];
  const speeds: number[] = [];
  const phasePins = new Set(track.phases.flatMap((phase) => [phase.startPointIndex, phase.endPointIndex]));
  for (let index = 1; index < track.points.length; index += 1) {
    const distance = haversineDistance(track.points[index - 1], track.points[index]);
    if (!track.points[index].breakBefore && distance > 0) distances.push(distance);
    const seconds = Math.max(1 / fps, (track.points[index].frame - track.points[index - 1].frame) / fps);
    if (distance > 0) speeds.push(distance / seconds);
  }
  const distanceReference = Math.max(500, percentile(distances, 0.75));
  const speedReference = Math.max(100, percentile(speeds, 0.75));
  const pinIndices = track.points.flatMap((point, index) => {
    if (index === 0 || index === track.points.length - 1) return [index];
    const distance = haversineDistance(track.points[index - 1], point);
    const meaningfulVisit = point.kind === 'visit' && track.points[index - 1].kind !== 'visit';
    return meaningfulVisit || point.breakBefore || phasePins.has(index) || distance >= distanceReference * 3 ? [index] : [];
  });
  return {distanceReference, speedReference, pinIndices};
};

const nextPinIndex = (stats: PredictionStats, currentIndex: number) =>
  stats.pinIndices.find((index) => index > currentIndex) ?? currentIndex;
const previousPinIndex = (stats: PredictionStats, currentIndex: number) =>
  stats.pinIndices.findLast((index) => index <= currentIndex) ?? currentIndex;

const cameraTarget = (track: PlaybackTrack, frame: number, config: CameraConfig, maximumZoom: number, stats: PredictionStats): MercatorCameraTarget => {
  const current = samplePlayback(track, frame)?.point ?? track.points[0];
  const currentX = longitudeToX(current.longitude);
  const currentY = latitudeToY(current.latitude);
  const currentIndex = Math.max(0, lowerBoundFrame(track.points, frame) - 1);
  const pin = track.points[nextPinIndex(stats, currentIndex)] ?? current;
  const pinX = unwrapX(longitudeToX(pin.longitude), currentX);
  const pinY = latitudeToY(pin.latitude);
  const previousPin = track.points[previousPinIndex(stats, currentIndex)] ?? current;
  const previousPinX = unwrapX(longitudeToX(previousPin.longitude), currentX);
  const previousPinY = latitudeToY(previousPin.latitude);
  const halfSecondFrames = Math.max(1, Math.round(config.output.fps / 2));
  const before = samplePlayback(track, Math.max(0, frame - halfSecondFrames))?.point ?? current;
  const after = samplePlayback(track, Math.min(track.durationInFrames - 1, frame + halfSecondFrames))?.point ?? current;
  const visualSpeed = haversineDistance(before, after);
  const pinDistance = haversineDistance(current, pin);
  const speedSignal = Math.tanh(visualSpeed / stats.speedReference);
  const distanceSignal = Math.tanh(pinDistance / Math.max(stats.distanceReference * 4, 1));
  const horizonRatio = 0.45 + 0.3 * speedSignal + 0.25 * distanceSignal;
  const adaptiveAnticipationSeconds = clamp(config.camera.anticipationSeconds * horizonRatio, 0.5, config.camera.anticipationSeconds);
  const pinFramesAway = Math.max(0, pin.frame - frame);
  const horizonFrames = Math.max(1, Math.round(adaptiveAnticipationSeconds * config.output.fps));
  const pinConfidence = smoothstep(1 - pinFramesAway / Math.max(1, horizonFrames * 1.5));
  const handoffFrames = Math.max(1, Math.round(MOTION.camera.pinHandoffSeconds * config.output.fps));
  const previousPinConfidence = smoothstep(1 - Math.max(0, frame - previousPin.frame) / handoffFrames);
  const nextPinConfidence = pinConfidence * (1 - previousPinConfidence);
  const combinedPinConfidence = clamp(previousPinConfidence + nextPinConfidence, 0, 1);
  const pinAnchorWeight = Math.max(1e-9, previousPinConfidence + nextPinConfidence);
  const pinAnchorX = (previousPinX * previousPinConfidence + pinX * nextPinConfidence) / pinAnchorWeight;
  const pinAnchorY = (previousPinY * previousPinConfidence + pinY * nextPinConfidence) / pinAnchorWeight;
  if (config.camera.mode === 'follow') {
    const lead = 0.28 * combinedPinConfidence;
    const dynamicZoomOut = 0.55 * speedSignal + 0.7 * distanceSignal * nextPinConfidence;
    return {
      x: currentX + (pinAnchorX - currentX) * lead,
      y: currentY + (pinAnchorY - currentY) * lead,
      zoom: clamp(config.camera.zoom - dynamicZoomOut, MOTION.camera.minimumZoom, Math.min(config.camera.zoom, maximumZoom)),
    };
  }
  const phase = phaseAtFrame(track, frame);
  const anticipationSeconds = phase?.kind === 'routine'
    ? Math.min(adaptiveAnticipationSeconds, MOTION.camera.routineAnticipationSeconds)
    : adaptiveAnticipationSeconds;
  const futureFrames = Math.max(1, Math.round(anticipationSeconds * config.output.fps));
  const pastFrames = Math.round(MOTION.camera.lookBehindSeconds * config.output.fps);
  const phaseStartFrame = phase && phase.kind !== 'routine' ? phase.startFrame : 0;
  const startIndex = Math.max(0, lowerBoundFrame(track.points, Math.max(phaseStartFrame, frame - pastFrames)) - 1);
  let endFrame = Math.min(track.durationInFrames - 1, frame + futureFrames);
  if (phase?.kind === 'destination') {
    const returnPreviewFrames = MOTION.camera.destinationReturnPreviewSeconds * config.output.fps;
    if (phase.endFrame - frame > returnPreviewFrames) endFrame = Math.min(endFrame, phase.endFrame);
  } else if (phase?.kind === 'outbound') {
    const phaseIndex = track.phases.indexOf(phase);
    const destinationPhase = track.phases[phaseIndex + 1];
    if (destinationPhase?.kind === 'destination') endFrame = Math.min(endFrame, destinationPhase.endFrame);
  } else if (phase && ['return', 'transition'].includes(phase.kind)) {
    endFrame = Math.min(endFrame, phase.endFrame);
  }
  let minimumX = currentX;
  let maximumX = currentX;
  let minimumY = currentY;
  let maximumY = currentY;

  for (let index = startIndex; index < track.points.length && track.points[index].frame <= endFrame; index += 1) {
    const point = track.points[index];
    const offset = Math.max(0, point.frame - frame);
    const influence = offset === 0 ? 1 : Math.exp(-3 * offset / futureFrames);
    const pointX = unwrapX(longitudeToX(point.longitude), currentX);
    const pointY = latitudeToY(point.latitude);
    const influencedX = currentX + (pointX - currentX) * influence;
    const influencedY = currentY + (pointY - currentY) * influence;
    minimumX = Math.min(minimumX, influencedX);
    maximumX = Math.max(maximumX, influencedX);
    minimumY = Math.min(minimumY, influencedY);
    maximumY = Math.max(maximumY, influencedY);
  }

  const dimensions = outputDimensions(config);
  const minimumSpan = MOTION.camera.minimumSpanMeters / MOTION.camera.earthCircumferenceMeters;
  const spanX = Math.max(minimumSpan, maximumX - minimumX);
  const spanY = Math.max(minimumSpan, maximumY - minimumY);
  const zoomX = Math.log2((dimensions.width * config.camera.framing) / (spanX * MOTION.camera.tileSize));
  const zoomY = Math.log2((dimensions.height * config.camera.framing) / (spanY * MOTION.camera.tileSize));
  let zoom = clamp(Math.min(zoomX, zoomY), MOTION.camera.minimumZoom, Math.min(config.camera.zoom, maximumZoom));
  let centerX = (minimumX + maximumX) / 2;
  let centerY = (minimumY + maximumY) / 2;
  const centerWeight = 1.75 + combinedPinConfidence * 1.25;
  centerX = (centerX + currentX * 0.75 + pinAnchorX * combinedPinConfidence * 1.25) / centerWeight;
  centerY = (centerY + currentY * 0.75 + pinAnchorY * combinedPinConfidence * 1.25) / centerWeight;
  const progress = phaseProgress(phase, frame);
  if (phase && ['outbound', 'return', 'transition'].includes(phase.kind) && progress >= MOTION.camera.arrivalRecoveryStartRatio) {
    const recovery = smoothstep((progress - MOTION.camera.arrivalRecoveryStartRatio) / (1 - MOTION.camera.arrivalRecoveryStartRatio));
    const endpoint = track.points[phase.endPointIndex];
    const endpointX = unwrapX(longitudeToX(endpoint.longitude), centerX);
    const endpointY = latitudeToY(endpoint.latitude);
    centerX += (endpointX - centerX) * recovery * 0.7;
    centerY += (endpointY - centerY) * recovery * 0.7;
    zoom = Math.max(zoom, MOTION.camera.minimumZoom + (Math.min(config.camera.zoom, maximumZoom, MOTION.camera.arrivalFocusZoom) - MOTION.camera.minimumZoom) * recovery);
  }
  return {x: centerX, y: centerY, zoom};
};

export const buildCameraTrack = (track: PlaybackTrack, config: CameraConfig, maximumZoom: number = MOTION.camera.maximumOverzoom): CameraFrame[] => {
  if (!track.points.length) return [];
  const stats = buildPredictionStats(track, config.output.fps);
  if (track.durationInFrames === 1) {
    const target = cameraTarget(track, 0, config, maximumZoom, stats);
    return [{latitude: yToLatitude(target.y), longitude: xToLongitude(target.x), zoom: target.zoom}];
  }
  const dimensions = outputDimensions(config);
  const knotInterval = Math.max(1, Math.round(config.output.fps * (0.15 + config.camera.smoothing * 0.85)));
  const knotFrameSet = new Set<number>([0, track.durationInFrames - 1]);
  for (let frame = knotInterval; frame < track.durationInFrames - 1; frame += knotInterval) knotFrameSet.add(frame);
  for (const phase of track.phases) {
    knotFrameSet.add(phase.startFrame);
    knotFrameSet.add(phase.endFrame);
  }
  for (const index of stats.pinIndices) knotFrameSet.add(track.points[index].frame);
  const knotFrames = [...knotFrameSet].filter((frame) => frame >= 0 && frame < track.durationInFrames).toSorted((a, b) => a - b);
  const knotTargets = knotFrames.map((frame) => cameraTarget(track, frame, config, maximumZoom, stats));
  for (let index = 1; index < knotTargets.length; index += 1) knotTargets[index].x = unwrapX(knotTargets[index].x, knotTargets[index - 1].x);
  const knotSpans = knotTargets.map((target) => dimensions.width / (MOTION.camera.tileSize * 2 ** target.zoom));
  const knotLogSpans = knotSpans.map(Math.log);
  const settledFrames = new Set([0, track.durationInFrames - 1, ...track.phases.flatMap((phase) => [phase.startFrame, phase.endFrame])]);
  const tangentScale = MOTION.camera.splineTangentBase + config.camera.smoothing * MOTION.camera.splineTangentSmoothingWeight;
  const xVelocities = knotVelocities(knotTargets.map((target) => target.x), knotFrames, settledFrames, tangentScale);
  const yVelocities = knotVelocities(knotTargets.map((target) => target.y), knotFrames, settledFrames, tangentScale);
  const logSpanVelocities = knotVelocities(knotLogSpans, knotFrames, settledFrames, tangentScale);
  const values = new Array<CameraFrame>(track.durationInFrames);
  let zoomDirection = 0;
  let framesSinceZoomDirectionChange = Number.POSITIVE_INFINITY;

  for (let knotIndex = 0; knotIndex < knotFrames.length - 1; knotIndex += 1) {
    const startFrame = knotFrames[knotIndex];
    const endFrame = knotFrames[knotIndex + 1];
    const from = knotTargets[knotIndex];
    const to = knotTargets[knotIndex + 1];
    const fromSpan = knotSpans[knotIndex];
    const toSpan = knotSpans[knotIndex + 1];
    const displacement = Math.hypot(to.x - from.x, to.y - from.y) / Math.max(fromSpan, toSpan, 1e-9);
    const rho = 0.8 + 0.6 * Math.tanh(displacement);
    const zoomWithRho = (interpolateZoom as unknown as {rho: (value: number) => (a: [number, number, number], b: [number, number, number]) => (progress: number) => [number, number, number]}).rho(rho);
    const interpolateSwoop = zoomWithRho([from.x, from.y, fromSpan], [to.x, to.y, toSpan]);
    const swoopSignal = smoothstep((displacement - MOTION.camera.swoopStartVisibleSpans) / (MOTION.camera.swoopFullVisibleSpans - MOTION.camera.swoopStartVisibleSpans));
    const swoopBlend = MOTION.camera.maximumSwoopBlend * swoopSignal;
    const duration = Math.max(1, endFrame - startFrame);
    for (let frame = startFrame; frame <= endFrame; frame += 1) {
      const progress = (frame - startFrame) / duration;
      const directX = hermite(from.x, to.x, xVelocities[knotIndex], xVelocities[knotIndex + 1], duration, progress);
      const directY = hermite(from.y, to.y, yVelocities[knotIndex], yVelocities[knotIndex + 1], duration, progress);
      const directLogSpan = clamp(
        hermite(knotLogSpans[knotIndex], knotLogSpans[knotIndex + 1], logSpanVelocities[knotIndex], logSpanVelocities[knotIndex + 1], duration, progress),
        Math.min(knotLogSpans[knotIndex], knotLogSpans[knotIndex + 1]),
        Math.max(knotLogSpans[knotIndex], knotLogSpans[knotIndex + 1]),
      );
      const [swoopX, swoopY, swoopSpan] = interpolateSwoop(progress);
      const interpolatedX = mix(directX, swoopX, swoopBlend);
      const interpolatedY = mix(directY, swoopY, swoopBlend);
      const span = Math.exp(mix(directLogSpan, Math.log(Math.max(swoopSpan, 1e-12)), swoopBlend));
      let zoom = clamp(Math.log2(dimensions.width / (MOTION.camera.tileSize * Math.max(span, 1e-12))), MOTION.camera.minimumZoom, Math.min(config.camera.zoom, maximumZoom));
      const previous = values[frame - 1];
      if (previous) {
        let zoomDelta = Math.abs(zoom - previous.zoom) < MOTION.camera.zoomDeadband ? 0 : zoom - previous.zoom;
        const desiredDirection = Math.sign(zoomDelta);
        if (desiredDirection && zoomDirection && desiredDirection !== zoomDirection) {
          if (framesSinceZoomDirectionChange < MOTION.camera.minimumZoomDirectionSeconds * config.output.fps) zoomDelta = 0;
          else {
            zoomDirection = desiredDirection;
            framesSinceZoomDirectionChange = 0;
          }
        } else if (desiredDirection && zoomDirection === 0) {
          zoomDirection = desiredDirection;
          framesSinceZoomDirectionChange = 0;
        }
        framesSinceZoomDirectionChange += 1;
        const maximumZoomOutStep = MOTION.camera.maximumZoomOutPerSecond / config.output.fps;
        const maximumZoomInStep = MOTION.camera.maximumZoomInPerSecond * MOTION.camera.arrivalZoomSpeedMultiplier / config.output.fps;
        zoom = previous.zoom + clamp(zoomDelta, -maximumZoomOutStep, maximumZoomInStep);
      }
      let x = interpolatedX;
      let y = interpolatedY;
      const activePhase = phaseAtFrame(track, frame);
      if (previous) {
        const previousX = unwrapX(longitudeToX(previous.longitude), x);
        const previousY = latitudeToY(previous.latitude);
        const panX = x - previousX;
        const panY = y - previousY;
        const panDistance = Math.hypot(panX, panY);
        const travelMultiplier = activePhase && ['outbound', 'return', 'transition'].includes(activePhase.kind) ? MOTION.camera.travelPanSpeedMultiplier : 1;
        const viewportPerSecond = mix(MOTION.camera.maximumPanViewportPerSecond, MOTION.camera.minimumPanViewportPerSecond, config.camera.smoothing) * travelMultiplier;
        const maximumPanStep = Math.min(dimensions.width, dimensions.height) * viewportPerSecond / (MOTION.camera.tileSize * 2 ** zoom * config.output.fps);
        if (panDistance > maximumPanStep) {
          x = previousX + panX / panDistance * maximumPanStep;
          y = previousY + panY / panDistance * maximumPanStep;
        }
      }
      const current = samplePlayback(track, frame)?.point ?? track.points[0];
      const currentX = unwrapX(longitudeToX(current.longitude), x);
      const currentY = latitudeToY(current.latitude);
      const worldPixels = MOTION.camera.tileSize * 2 ** zoom;
      const safeViewportRatio = activePhase && ['outbound', 'return', 'transition'].includes(activePhase.kind)
        ? MOTION.camera.travelMarkerSafeViewportRatio
        : MOTION.camera.markerSafeViewportRatio;
      const safeX = dimensions.width * safeViewportRatio / worldPixels;
      const safeY = dimensions.height * safeViewportRatio / worldPixels;
      x = clamp(x, currentX - safeX, currentX + safeX);
      y = clamp(y, currentY - safeY, currentY + safeY);
      values[frame] = {latitude: yToLatitude(y), longitude: xToLongitude(x), zoom};
    }
  }
  return values.map((value, index) => value ?? values[Math.max(0, index - 1)]);
};
