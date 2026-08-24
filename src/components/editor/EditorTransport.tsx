'use client';

import {useCallback, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject} from 'react';
import type {PlayerRef} from '@remotion/player';
import {Tooltip} from 'radix-ui';
import {CircleHelp, Maximize2, Pause, Play, RotateCcw, StepBack, StepForward} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {PlaybackTrack} from '@/domain/playback';
import type {VideoConfig} from '@/domain/timeline';

const formatTimecode = (frame: number, fps: number) => {
  const totalSeconds = Math.floor(frame / fps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(Math.max(0, frame % fps)).padStart(2, '0')}`;
};

export function EditorTransport({playerRef, track, config, currentFrame, playing, playbackRate, setPlaybackRate, currentDate, onShortcuts}: {playerRef: RefObject<PlayerRef | null>; track: PlaybackTrack; config: VideoConfig; currentFrame: number; playing: boolean; playbackRate: number; setPlaybackRate: (rate: number) => void; currentDate: number; onShortcuts: () => void}) {
  const {t, i18n} = useTranslation();
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const maximum = Math.max(0, track.durationInFrames - 1);
  const seek = (frame: number) => playerRef.current?.seekTo(Math.max(0, Math.min(maximum, frame)));
  const currentPercent = currentFrame / Math.max(1, maximum) * 100;
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-US' : 'ko-KR', {year: 'numeric', month: 'short', day: 'numeric'}).format(currentDate);
  return <div className="transport">
    <div className="transport-buttons"><IconTool help={t('player.restart')} onClick={() => {seek(0); playerRef.current?.play();}}><RotateCcw size={16} /></IconTool><IconTool help={t('player.previousFrame')} onClick={() => seek(currentFrame - 1)}><StepBack size={16} /></IconTool><button className="transport-main" onClick={() => playerRef.current?.toggle()} aria-label={playing ? t('player.pause') : t('player.play')}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><IconTool help={t('player.nextFrame')} onClick={() => seek(currentFrame + 1)}><StepForward size={16} /></IconTool></div>
    <div className="transport-copy"><strong>{formatTimecode(currentFrame, config.output.fps)} / {formatTimecode(maximum, config.output.fps)}</strong><span>{date}</span></div>
    <div className="transport-progress" onPointerDown={(event) => {const rect = event.currentTarget.getBoundingClientRect(); const frame = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * maximum); playerRef.current?.pause(); seek(frame); setHoverFrame(frame);}} onPointerLeave={() => setHoverFrame(null)} onPointerMove={(event) => {const rect = event.currentTarget.getBoundingClientRect(); setHoverFrame(Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * maximum));}}><div className="phase-track">{track.phases.map((phase, index) => <i key={`${phase.kind}-${index}`} className={`phase-${phase.kind}`} style={{left: `${phase.startFrame / Math.max(1, maximum) * 100}%`, width: `${Math.max(0.2, (phase.endFrame - phase.startFrame) / Math.max(1, maximum) * 100)}%`}} />)}</div><input aria-label={t('player.timeline')} type="range" min={0} max={maximum} value={Math.min(currentFrame, maximum)} onChange={(event) => seek(Number(event.target.value))} /><b className="playhead" style={{left: `${currentPercent}%`}} />{hoverFrame !== null ? <output style={{left: `${hoverFrame / Math.max(1, maximum) * 100}%`}}>{formatTimecode(hoverFrame, config.output.fps)}</output> : null}</div>
    <label className="rate-control"><span>{t('player.speed')}</span><select aria-label={t('player.speed')} value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}><option value={-1}>-1×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label><IconTool help={t('player.fullscreen')} onClick={() => playerRef.current?.requestFullscreen()}><Maximize2 size={16} /></IconTool><IconTool help={t('player.shortcuts')} onClick={onShortcuts}><CircleHelp size={16} /></IconTool>
  </div>;
}

export const useEditorShortcuts = ({playerRef, track, fps, setPlaybackRate, setShortcutsOpen}: {playerRef: RefObject<PlayerRef | null>; track: PlaybackTrack; fps: number; setPlaybackRate: (rate: number) => void; setShortcutsOpen: (open: boolean) => void}) => useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, select, textarea, button, [contenteditable="true"], [role="dialog"]')) return;
  const player = playerRef.current;
  if (!player) return;
  const current = player.getCurrentFrame();
  const seek = (frame: number) => player.seekTo(Math.max(0, Math.min(track.durationInFrames - 1, frame)));
  if (event.key === ' ' || event.key.toLowerCase() === 'k') {event.preventDefault(); player.toggle();}
  else if (event.key.toLowerCase() === 'j') {event.preventDefault(); setPlaybackRate(-1); player.play();}
  else if (event.key.toLowerCase() === 'l') {event.preventDefault(); setPlaybackRate(1); player.play();}
  else if (event.key === 'ArrowLeft') {event.preventDefault(); seek(current - (event.shiftKey ? fps : 1));}
  else if (event.key === 'ArrowRight') {event.preventDefault(); seek(current + (event.shiftKey ? fps : 1));}
  else if (event.key === 'Home') {event.preventDefault(); seek(0);}
  else if (event.key === 'End') {event.preventDefault(); seek(track.durationInFrames - 1);}
  else if (event.key.toLowerCase() === 'f') {event.preventDefault(); player.requestFullscreen();}
  else if (event.key === '?') {event.preventDefault(); setShortcutsOpen(true);}
}, [fps, playerRef, setPlaybackRate, setShortcutsOpen, track]);

function IconTool({help, children, onClick}: {help: string; children: React.ReactNode; onClick: () => void}) {
  return <Tooltip.Root><Tooltip.Trigger asChild><button className="icon-tool" onClick={onClick} aria-label={help}>{children}</button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip-content" sideOffset={7}>{help}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}
