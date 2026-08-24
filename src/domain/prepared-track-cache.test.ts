import {describe, expect, it} from 'vitest';
import {defaultSampleScenario} from '@/samples/scenarios';
import {defaultVideoConfig} from './timeline';
import {getPreparedPlaybackTrack} from './prepared-track-cache';

describe('prepared playback cache', () => {
  it('reuses timing work for visual-only changes and invalidates timing changes', () => {
    const timeline = defaultSampleScenario.timeline;
    const config = defaultVideoConfig(Date.parse(timeline.summary.startTime), Date.parse(timeline.summary.endTime));
    const first = getPreparedPlaybackTrack(timeline, config);
    const visualChange = {...config, marker: {...config.marker, size: config.marker.size + 1}};
    expect(getPreparedPlaybackTrack(timeline, visualChange)).toBe(first);
    const timingChange = {...config, playback: {...config.playback, distanceInfluence: 0.9}};
    expect(getPreparedPlaybackTrack(timeline, timingChange)).not.toBe(first);
  });
});
