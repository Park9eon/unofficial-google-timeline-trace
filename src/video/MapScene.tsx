'use client';

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import {continueRender, delayRender, useVideoConfig} from 'remotion';
import {activityEmoji, activityLabel} from '@/domain/activity';
import {buildCameraTrack, fixedCameraBounds} from '@/domain/camera';
import {buildHeadingTrack} from '@/domain/heading';
import {MOTION} from '@/domain/motion-constants';
import {samplePlayback, type PlaybackTrack} from '@/domain/playback';
import {simplifyPlaybackTrack} from '@/domain/track-simplification';
import type {SupportedLocale, VideoConfig} from '@/domain/timeline';
import {applyMapAppearance, ONLINE_MAP_STYLE_URL, type MapRuntime} from './map-style';
import {publishMapRuntimeState} from './map-runtime-store';
import {drawTrail, type ScreenTrailPoint} from './draw-trail';

const activityColors: Record<string, string> = {
  walking: '#f7c873', running: '#ff775f', cycling: '#77d5a7',
  'in subway': '#b89cff', 'in bus': '#5fb6ff', 'in passenger vehicle': '#8cd3ff',
  'in train': '#d69cff', flying: '#f3f6f4', visit: '#849092', unknown: '#d4dcda',
};

type Props = {
  track: PlaybackTrack;
  frame: number;
  config: VideoConfig;
  runtime: MapRuntime;
  locale: SupportedLocale;
  reportRuntime: boolean;
};

const mapFailureMessage = (locale: SupportedLocale, raw: string) => {
  const missingAddress = /base URL|not configured/i.test(raw);
  if (locale === 'ko') return missingAddress
    ? '온라인 지도 주소가 설정되지 않았습니다.'
    : '지도 파일을 불러오지 못했습니다. 지도 설정에서 다시 시도하거나 저장된 지도를 삭제해 보세요.';
  return missingAddress
    ? 'The online map address is not configured.'
    : 'Map files could not be loaded. Retry in Map settings or delete the saved maps.';
};

const disposeMap = (map: maplibregl.Map) => {
  const canvas = map.getCanvas();
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const loseContext = context?.getExtension('WEBGL_lose_context');
  map.remove();
  if (context && !context.isContextLost()) loseContext?.loseContext();
};

export function MapScene({track, frame, config, runtime, locale, reportRuntime}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const {width, height} = useVideoConfig();
  const sampled = useMemo(() => simplifyPlaybackTrack(track.points), [track.points]);
  const cameraFrames = useMemo(() => config.camera.mode === 'fixed' ? [] : buildCameraTrack(track, {camera: config.camera, output: config.output}), [config.camera, config.output, track]);
  const headingFrames = useMemo(() => config.marker.type === 'emoji' ? buildHeadingTrack(track, config.output.fps) : [], [config.marker.type, config.output.fps, track]);
  const current = samplePlayback(track, frame);
  const fixedBounds = useMemo(() => fixedCameraBounds(track.points), [track.points]);
  const fixedIdentity = config.camera.mode === 'fixed' ? `:${config.camera.zoom}:${JSON.stringify(fixedBounds)}:${width}x${height}` : '';
  const mapIdentity = `${JSON.stringify(config.map)}:${runtime.revision ?? 0}:${config.camera.mode}${fixedIdentity}`;
  const renderHandle = useMemo(() => delayRender(`지도와 글꼴을 준비하는 중: ${mapIdentity.length}`), [mapIdentity]);
  const initializationRef = useRef({config, runtime, track, width, fixedBounds});
  const report = useCallback((status: Parameters<typeof publishMapRuntimeState>[0], message: string) => {
    if (reportRuntime) publishMapRuntimeState(status, message);
  }, [reportRuntime]);

  useEffect(() => {
    initializationRef.current = {config, runtime, track, width, fixedBounds};
  }, [config, fixedBounds, runtime, track, width]);

  useEffect(() => {
    if (!containerRef.current) return;
    const initialization = initializationRef.current;
    setReady(false);
    setMapError(null);
    report('loading', locale === 'ko' ? '전세계 지도를 준비하는 중' : 'Preparing the world map');
    const controller = new AbortController();
    let timeout = 0;
    let map: maplibregl.Map | null = null;
    let completed = false;
    const complete = () => {
      if (completed || !map) return;
      completed = true;
      map.resize();
      setReady(true);
      report('ready', locale === 'ko' ? '지도 준비됨' : 'Map ready');
      continueRender(renderHandle);
    };
    const start = async () => {
      if (controller.signal.aborted || !containerRef.current) return;
      const first = initialization.track.points[0];
      map = new maplibregl.Map({
        container: containerRef.current,
        style: ONLINE_MAP_STYLE_URL,
        center: first ? [first.longitude, first.latitude] : [0, 20],
        zoom: initialization.config.camera.mode === 'fixed' ? 2 : Math.min(initialization.config.camera.zoom, MOTION.camera.maximumOverzoom),
        attributionControl: false,
        interactive: false,
        fadeDuration: 0,
        canvasContextAttributes: {antialias: true, preserveDrawingBuffer: true},
        localIdeographFontFamily: 'sans-serif',
      });
      mapRef.current = map;
      if (process.env.NODE_ENV === 'development') (window as typeof window & {__traceMap?: maplibregl.Map}).__traceMap = map;
      map.on('styleimagemissing', (event) => {
        if (!map?.hasImage(event.id)) map?.addImage(event.id, {width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0])});
      });
      map.on('error', (event) => {
        const message = event.error?.message ?? String(event);
        console.error('MapLibre:', message);
        if (/failed to fetch|source|style|sprite|glyph|tile/i.test(message)) {
          const displayMessage = mapFailureMessage(locale, message);
          setMapError(displayMessage);
          report('error', displayMessage);
        }
      });
      map.once('load', () => {
        if (!map) return;
        map.resize();
        applyMapAppearance(map, initialization.config);
        if (initialization.config.camera.mode === 'fixed' && initialization.track.points.length > 1) {
          map.fitBounds(initialization.fixedBounds, {padding: Math.max(60, initialization.width * 0.08), duration: 0, maxZoom: Math.min(initialization.config.camera.zoom, MOTION.camera.maximumOverzoom)});
        }
        requestAnimationFrame(() => {
          if (!map) return;
          map.resize();
          map.triggerRepaint();
          map.once('idle', complete);
        });
      });
      timeout = window.setTimeout(() => {
        if (map?.loaded()) complete();
        else {
          const message = locale === 'ko' ? '온라인 지도 준비가 완료되지 않았습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.' : 'The online map did not finish loading. Check the connection and retry.';
          setMapError(message);
          report('reload-required', message);
          continueRender(renderHandle);
        }
      }, 12_000);
    };
    start().catch((error) => {
      if (controller.signal.aborted) return;
      const message = mapFailureMessage(locale, error instanceof Error ? error.message : 'Map initialization failed.');
      setMapError(message);
      report('error', message);
      continueRender(renderHandle);
    });
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      if (map) disposeMap(map);
      if (process.env.NODE_ENV === 'development') delete (window as typeof window & {__traceMap?: maplibregl.Map}).__traceMap;
      mapRef.current = null;
    };
  }, [locale, mapIdentity, renderHandle, report]);

  useLayoutEffect(() => {
    const map = mapRef.current;
    const canvas = trailRef.current;
    if (!map || !canvas || !current || !ready) return;
    map.resize();
    if (config.camera.mode !== 'fixed') {
      const camera = cameraFrames[Math.min(frame, cameraFrames.length - 1)];
      if (camera) map.jumpTo({center: [camera.longitude, camera.latitude], zoom: camera.zoom, bearing: 0});
    }
    if (markerRef.current) {
      const projected = map.project([current.point.longitude, current.point.latitude]);
      markerRef.current.style.left = `${projected.x}px`;
      markerRef.current.style.top = `${projected.y}px`;
    }
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const projectedPoints: ScreenTrailPoint[] = [];
    for (let index = 0; index < sampled.length && sampled[index].frame <= frame; index += 1) {
      const point = sampled[index];
      const projected = map.project([point.longitude, point.latitude]);
      projectedPoints.push({
        x: projected.x,
        y: projected.y,
        frame: point.frame,
        color: config.trail.colorMode === 'activity' ? activityColors[point.activity] ?? config.marker.color : config.marker.color,
        breakBefore: point.breakBefore,
        curveSign: point.id.charCodeAt(point.id.length - 1) % 2 ? 1 : -1,
      });
    }
    const projectedCurrent = map.project([current.point.longitude, current.point.latitude]);
    const lastProjected = projectedPoints.at(-1);
    if (!lastProjected || lastProjected.frame < frame || Math.hypot(lastProjected.x - projectedCurrent.x, lastProjected.y - projectedCurrent.y) > 0.5) {
      projectedPoints.push({
        x: projectedCurrent.x,
        y: projectedCurrent.y,
        frame,
        color: config.trail.colorMode === 'activity' ? activityColors[current.point.activity] ?? config.marker.color : config.marker.color,
        breakBefore: current.isPredictedGap,
        curveSign: current.point.id.charCodeAt(current.point.id.length - 1) % 2 ? 1 : -1,
      });
    }
    if (config.trail.showAccumulated) drawTrail(context, projectedPoints, () => config.trail.accumulatedOpacity, config.trail.width * 0.7);
    const tailFrames = config.trail.recentDurationSeconds * config.output.fps;
    const recentIndex = projectedPoints.findIndex((point) => point.frame >= frame - tailFrames);
    const recent = recentIndex < 0 ? [] : projectedPoints.slice(Math.max(0, recentIndex - 1));
    drawTrail(context, recent, (point) => 0.12 + 0.88 * Math.max(0, (point.frame - (frame - tailFrames)) / tailFrames), config.trail.width);
    context.globalAlpha = 1;
  }, [cameraFrames, config, current, frame, height, ready, sampled, track, width]);

  return (
    <div className={`map-scene map-${config.map.stylePreset}`} data-ready={ready} data-map-provider="openfreemap">
      <div ref={containerRef} className="map-canvas" style={{filter: `saturate(${1 + config.map.saturation}) brightness(${1 + config.map.brightness})`}} />
      <canvas ref={trailRef} className="trail-canvas" />
      {current ? <div ref={markerRef} className={`timeline-marker marker-${config.marker.type}`} style={{left: '50%', top: '50%', width: config.marker.size, height: config.marker.size, color: config.marker.color, transform: 'translate(-50%, -50%)'}}><MarkerSymbol config={config} activity={current.point.activity} heading={headingFrames[Math.min(frame, headingFrames.length - 1)] ?? 0} /></div> : null}
      {current ? <MapLabels config={config} current={current} shortDimension={Math.min(width, height)} locale={locale} /> : null}
      <div className="map-attribution">
        OpenFreeMap © OpenMapTiles · Data from OpenStreetMap
      </div>
      {!ready ? <div className={`map-loading ${mapError ? 'map-error' : ''}`}>{mapError ?? (locale === 'ko' ? '지도를 불러오는 중' : 'Loading map')}</div> : null}
    </div>
  );
}

function MarkerSymbol({config, activity, heading}: {config: VideoConfig; activity: string; heading: number}) {
  if (config.marker.type === 'circle') return <svg viewBox="0 0 40 40" aria-hidden="true"><circle className="marker-shadow" cx="20" cy="20" r="14" /><circle className="marker-fill" cx="20" cy="20" r="9" /><circle cx="20" cy="20" r="3" fill="#fff" /></svg>;
  const rotateGlyph = activity === 'flying';
  const mirrorGlyph = !rotateGlyph && heading > 180;
  return <div className="marker-badge"><svg className="marker-direction" viewBox="0 0 40 40" aria-hidden="true" style={{transform: `rotate(${heading}deg)`}}><path d="M20 1 25 13 20 11 15 13Z" /></svg><span className="marker-emoji" role="img" aria-hidden="true" style={{transform: rotateGlyph ? `rotate(${heading - 45}deg)` : `scaleX(${mirrorGlyph ? -1 : 1})`}}>{activityEmoji(activity)}</span></div>;
}

function MapLabels({config, current, shortDimension, locale}: {config: VideoConfig; current: NonNullable<ReturnType<typeof samplePlayback>>; shortDimension: number; locale: SupportedLocale}) {
  const localTime = new Date(current.point.timestamp + current.point.timezoneOffsetMinutes * 60_000);
  const intlLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
  const date = new Intl.DateTimeFormat(intlLocale, {timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric'}).format(localTime);
  const time = new Intl.DateTimeFormat(intlLocale, {timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false}).format(localTime);
  return (
    <div className={`map-labels label-${config.labels.position} label-${config.labels.size} label-style-${config.labels.style}`} style={{width: shortDimension * (config.labels.size === 'compact' ? 0.3 : 0.38), '--label-scale': shortDimension / 1080} as React.CSSProperties}>
      {config.labels.showTitle && config.labels.title ? <strong className="label-title">{config.labels.title}</strong> : null}
      {config.labels.showSubtitle && config.labels.subtitle ? <span className="label-subtitle">{config.labels.subtitle}</span> : null}
      {config.labels.date ? <strong className="label-date">{date}</strong> : null}
      {config.labels.time ? <span>{time}</span> : null}
      {config.labels.activity ? <span>{activityLabel(current.point.activity, locale)}</span> : null}
      {config.labels.distance ? <span>{(current.point.cumulativeDistanceMeters / 1000).toLocaleString(intlLocale, {maximumFractionDigits: 0})} km</span> : null}
      {config.labels.progress ? <div className="label-progress"><i style={{width: `${current.progress * 100}%`}} /></div> : null}
    </div>
  );
}
