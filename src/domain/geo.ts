import type {TrackPoint} from './timeline';

const EARTH_RADIUS_METERS = 6_371_000;

export const haversineDistance = (
  a: Pick<TrackPoint, 'latitude' | 'longitude'>,
  b: Pick<TrackPoint, 'latitude' | 'longitude'>,
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
};

export const bearingBetween = (
  a: Pick<TrackPoint, 'latitude' | 'longitude'>,
  b: Pick<TrackPoint, 'latitude' | 'longitude'>,
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const y = Math.sin(toRadians(b.longitude - a.longitude)) * Math.cos(toRadians(b.latitude));
  const x =
    Math.cos(toRadians(a.latitude)) * Math.sin(toRadians(b.latitude)) -
    Math.sin(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) *
      Math.cos(toRadians(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

export const interpolateLongitude = (from: number, to: number, progress: number) => {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const value = from + delta * progress;
  return ((value + 540) % 360) - 180;
};
