import type {NormalizedTimeline} from '@/domain/timeline';
import type {TimelineParseErrorCode} from '@/domain/parse-timeline';
import {withTimeout} from '@/lib/async';

type ImportResult = {
  timeline: NormalizedTimeline;
  source: Blob;
  sourceEncoding: 'gzip' | 'identity';
};

export type TimelineImportErrorCode = TimelineParseErrorCode | 'worker' | 'timeout' | 'unknown';

export class TimelineImportError extends Error {
  constructor(public readonly code: TimelineImportErrorCode) {
    super(code);
    this.name = 'TimelineImportError';
  }
}

export const importTimelineFile = (file: File): Promise<ImportResult> => {
  const worker = new Worker(new URL('../workers/timeline-import.worker.ts', import.meta.url), {type: 'module'});
  const id = crypto.randomUUID();
  const operation = new Promise<ImportResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{id: string; ok: boolean; timeline?: NormalizedTimeline; source?: Blob; sourceEncoding?: 'gzip' | 'identity'; errorCode?: TimelineImportErrorCode}>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (!event.data.ok || !event.data.timeline || !event.data.source || !event.data.sourceEncoding) {reject(new TimelineImportError(event.data.errorCode ?? 'unknown')); return;}
      resolve({timeline: event.data.timeline, source: event.data.source, sourceEncoding: event.data.sourceEncoding});
    };
    worker.onerror = () => {worker.terminate(); reject(new TimelineImportError('worker'));};
    worker.postMessage({id, file});
  });
  return withTimeout(operation, 120_000, 'Timeline import timed out.', () => worker.terminate()).catch((error) => {
    if (error instanceof TimelineImportError) throw error;
    throw new TimelineImportError(error instanceof Error && error.message === 'Timeline import timed out.' ? 'timeout' : 'unknown');
  });
};
