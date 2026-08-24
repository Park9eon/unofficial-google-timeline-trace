import {bearingBetween, haversineDistance} from './geo';
import {MOTION} from './motion-constants';
import {samplePlayback, type PlaybackTrack} from './playback';

const profileFor = (activity: string) => {
  if (activity === 'walking' || activity === 'running') return MOTION.heading.walking;
  if (activity === 'cycling' || activity === 'skiing' || activity === 'motorcycling') return MOTION.heading.active;
  if (activity === 'flying') return MOTION.heading.flying;
  if (activity === 'visit' || activity === 'unknown') return MOTION.heading.stationary;
  return MOTION.heading.vehicle;
};

export const buildHeadingTrack = (track: PlaybackTrack, fps: number) => {
  if (!track.durationInFrames) return [];
  const headings = new Array<number>(track.durationInFrames);
  let vectorX = 0;
  let vectorY = 1;
  let lastBearing = 0;
  for (let frame = 0; frame < track.durationInFrames; frame += 1) {
    const current = samplePlayback(track, frame)?.point ?? track.points[0];
    const profile = profileFor(current.activity);
    const futureFrame = Math.min(track.durationInFrames - 1, frame + Math.max(1, Math.round(profile.lookaheadSeconds * fps)));
    const future = samplePlayback(track, futureFrame)?.point ?? current;
    if (haversineDistance(current, future) >= profile.minimumDistanceMeters) lastBearing = bearingBetween(current, future);
    const radians = lastBearing * Math.PI / 180;
    const alpha = 1 - Math.exp(-1 / (fps * profile.filterSeconds));
    vectorX += (Math.sin(radians) - vectorX) * alpha;
    vectorY += (Math.cos(radians) - vectorY) * alpha;
    headings[frame] = (Math.atan2(vectorX, vectorY) * 180 / Math.PI + 360) % 360;
  }
  return headings;
};
