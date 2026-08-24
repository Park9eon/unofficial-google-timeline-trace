'use client';

import {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {getPreparedPlaybackTrack} from '@/domain/prepared-track-cache';
import type {NormalizedTimeline, SupportedLocale, VideoConfig} from '@/domain/timeline';
import {MapScene} from './MapScene';
import type {MapRuntime} from './map-style';

export type TimelineCompositionProps = {
  timeline: NormalizedTimeline;
  config: VideoConfig;
  runtime: MapRuntime;
  locale: SupportedLocale;
  reportMapRuntime?: boolean;
};

export function TimelineVideo({timeline, config, runtime, locale, reportMapRuntime = false}: TimelineCompositionProps) {
  const frame = useCurrentFrame();
  const track = useMemo(() => getPreparedPlaybackTrack(timeline, config), [timeline, config]);
  return (
    <AbsoluteFill style={{backgroundColor: '#090d10'}}>
      <MapScene key={`${JSON.stringify(config.map)}-${runtime.revision ?? 0}-${locale}`} track={track} frame={frame} config={config} runtime={runtime} locale={locale} reportRuntime={reportMapRuntime} />
    </AbsoluteFill>
  );
}
