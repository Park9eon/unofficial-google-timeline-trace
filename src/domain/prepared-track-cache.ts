import QuickLRU from 'quick-lru';
import {buildPlaybackTrack, type PlaybackTrack} from './playback';
import type {NormalizedTimeline, VideoConfig} from './timeline';

const playbackCache = new QuickLRU<string, PlaybackTrack>({maxSize: 8});

export const playbackCacheKey = (timeline: NormalizedTimeline, config: VideoConfig) => JSON.stringify({
  sourceHash: timeline.summary.sourceHash,
  range: config.range,
  playback: config.playback,
  fps: config.output.fps,
});

export const getPreparedPlaybackTrack = (timeline: NormalizedTimeline, config: VideoConfig) => {
  const key = playbackCacheKey(timeline, config);
  const cached = playbackCache.get(key);
  if (cached) return cached;
  const track = buildPlaybackTrack(timeline.points, config);
  playbackCache.set(key, track);
  return track;
};

export const clearPreparedPlaybackCache = () => playbackCache.clear();
