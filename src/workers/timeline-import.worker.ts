/// <reference lib="webworker" />

import {parseTimeline, TimelineParseError} from '@/domain/parse-timeline';

type ImportRequest = {id: string; file: File};

const compress = async (text: string) => {
  if (typeof CompressionStream === 'undefined') return {source: new Blob([text], {type: 'application/json'}), sourceEncoding: 'identity' as const};
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return {source: await new Response(stream).blob(), sourceEncoding: 'gzip' as const};
};

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const {id, file} = event.data;
  try {
    const rawText = await file.text();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawText));
    const sourceHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const timeline = parseTimeline(rawText, file.name, sourceHash);
    const compressed = await compress(rawText);
    self.postMessage({id, ok: true, timeline, ...compressed});
  } catch (error) {
    self.postMessage({id, ok: false, errorCode: error instanceof TimelineParseError ? error.code : 'unknown'});
  }
};

export {};
