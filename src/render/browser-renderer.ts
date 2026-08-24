import type {NormalizedTimeline, SupportedLocale, VideoConfig} from '@/domain/timeline';
import {getPreparedPlaybackTrack} from '@/domain/prepared-track-cache';
import {outputDimensions} from '@/domain/timeline';
import {TimelineVideo, type TimelineCompositionProps} from '@/video/TimelineVideo';
import type {MapRuntime} from '@/video/map-style';

export type BrowserRenderCapability = {
  canRender: boolean;
  messages: string[];
};

export type BrowserRenderProgress = {
  progress: number;
  encodedFrames: number;
  estimatedMilliseconds: number;
};

type WritableFileHandle = {
  createWritable: () => Promise<WritableStream>;
};

declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{description: string; accept: Record<string, string[]>}>;
    }) => Promise<WritableFileHandle>;
  }
}

export const renderOutputName = () => `timeline-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.mp4`;

const capabilityCache = new Map<string, Promise<BrowserRenderCapability>>();

export const checkBrowserRenderCapability = async (output: VideoConfig['output']): Promise<BrowserRenderCapability> => {
  const dimensions = outputDimensions({output});
  const key = `${dimensions.width}x${dimensions.height}:mp4:h264`;
  const cached = capabilityCache.get(key);
  if (cached) return cached;
  const check = (async () => {
    const {canRenderMediaOnWeb} = await import('@remotion/web-renderer');
    const result = await canRenderMediaOnWeb({
      width: dimensions.width,
      height: dimensions.height,
      container: 'mp4',
      videoCodec: 'h264',
      muted: true,
      videoBitrate: 'high',
    });
    return {canRender: result.canRender, messages: result.issues.map((issue) => issue.message)};
  })();
  capabilityCache.set(key, check);
  check.catch(() => capabilityCache.delete(key));
  return check;
};

export const requestVideoWritable = async (suggestedName: string) => {
  if (!window.showSaveFilePicker) return null;
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{description: 'MP4 video', accept: {'video/mp4': ['.mp4']}}],
  });
  return handle.createWritable();
};

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const renderTimelineInBrowser = async ({
  timeline,
  config,
  locale,
  runtime,
  outputName,
  outputWritable,
  signal,
  onProgress,
}: {
  timeline: NormalizedTimeline;
  config: VideoConfig;
  locale: SupportedLocale;
  runtime: MapRuntime;
  outputName: string;
  outputWritable: WritableStream | null;
  signal: AbortSignal;
  onProgress: (progress: BrowserRenderProgress) => void;
}) => {
  const {renderMediaOnWeb} = await import('@remotion/web-renderer');
  const dimensions = outputDimensions(config);
  const track = getPreparedPlaybackTrack(timeline, config);
  const props: TimelineCompositionProps = {timeline, config, locale, runtime};
  const result = await renderMediaOnWeb({
    composition: {
      id: 'TimelineFilm',
      component: TimelineVideo,
      width: dimensions.width,
      height: dimensions.height,
      fps: config.output.fps,
      durationInFrames: track.durationInFrames,
      defaultProps: props,
    },
    inputProps: props,
    container: 'mp4',
    videoCodec: 'h264',
    videoBitrate: 'high',
    hardwareAcceleration: 'no-preference',
    pageResponsiveness: 'medium',
    muted: true,
    signal,
    outputWritable: outputWritable as Parameters<typeof renderMediaOnWeb>[0]['outputWritable'],
    outputTarget: outputWritable ? null : 'web-fs',
    licenseKey: process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY || null,
    onProgress: ({progress, encodedFrames, renderEstimatedTime}) => onProgress({progress, encodedFrames, estimatedMilliseconds: renderEstimatedTime}),
  });
  if (!outputWritable) downloadBlob(await result.getBlob(), outputName);
};
