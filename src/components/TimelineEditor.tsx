'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type DragEvent} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {useMachine} from '@xstate/react';
import {Tooltip} from 'radix-ui';
import {useTranslation} from 'react-i18next';
import {
  Activity, CalendarDays, Check, ChevronDown, CircleHelp, Clapperboard, Database,
  Film, FolderOpen, Gauge, Languages, LoaderCircle, Map, MapPinned,
  Save, Settings2, Tag, Trash2,
  Upload, X,
} from 'lucide-react';
import {resolvePlaybackDuration, samplePlayback} from '@/domain/playback';
import {getPreparedPlaybackTrack} from '@/domain/prepared-track-cache';
import {defaultVideoConfig, outputDimensions, type NormalizedTimeline, type SupportedLocale, type VideoConfig} from '@/domain/timeline';
import {TimelineVideo} from '@/video/TimelineVideo';
import {useMapRuntimeState} from '@/video/map-runtime-store';
import {
  clearDatabase, deleteActiveTimeline, deleteAllPresets, deletePreset, listPresets,
  readActiveTimeline, savePreset, writeActiveTimeline, type SavedPreset,
} from '@/storage/database';
import {importTimelineFile, TimelineImportError} from '@/storage/import-timeline';
import {
  clearStoredSettings, configForTimeline, loadStoredSettings, saveStoredSettings,
  updateStoredLocale,
} from '@/storage/settings';
import {
  checkBrowserRenderCapability, renderOutputName, renderTimelineInBrowser,
  requestVideoWritable, type BrowserRenderCapability,
} from '@/render/browser-renderer';
import {EditorTransport, useEditorShortcuts} from './editor/EditorTransport';
import {HelpDialog, ShortcutsDialog, StorageDialog} from './editor/EditorDialogs';
import {Field, Range, Segmented, Toggle} from './editor/ControlField';
import {defaultSampleScenario, sampleScenarioById, sampleScenarios, type ScenarioDefinition} from '@/samples/scenarios';
import {studioMachine} from '@/state/studio-machine';
import {withTimeout} from '@/lib/async';

type Tab = 'story' | 'marker' | 'trail' | 'map' | 'labels' | 'output';
type Update = <K extends keyof VideoConfig>(section: K, value: Partial<VideoConfig[K]>) => void;
type RenderState = {
  status: 'idle' | 'preparing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  encodedFrames: number;
  estimatedMilliseconds: number;
  error?: string;
};

const paletteByPreset = {
  'night-pulse': {land: '#182124', water: '#0c2028', road: '#506064', boundary: '#6f7a7d', text: '#c2cecc'},
  'paper-atlas': {land: '#e8dfcd', water: '#b9d4d3', road: '#b7ad98', boundary: '#8f8776', text: '#454139'},
  'mono-fog': {land: '#bec7c6', water: '#9cafb2', road: '#879392', boundary: '#667372', text: '#293332'},
  'deep-ocean': {land: '#0c2530', water: '#071923', road: '#2c7180', boundary: '#5192a0', text: '#c5edf0'},
  'forest-glow': {land: '#14251d', water: '#122c30', road: '#456b57', boundary: '#658976', text: '#d5e8d9'},
  'sunset-dusk': {land: '#2d1d29', water: '#192536', road: '#9a5e67', boundary: '#bd7e75', text: '#f0d8cf'},
  blueprint: {land: '#0c2542', water: '#061321', road: '#3c77a8', boundary: '#6da4cd', text: '#d5ebff'},
  'clean-light': {land: '#ecefe9', water: '#c8dde4', road: '#b1bbb8', boundary: '#86918e', text: '#2d3736'},
};

const mapStyleNames: Record<VideoConfig['map']['stylePreset'], string> = {
  'night-pulse': 'Night Pulse', 'deep-ocean': 'Deep Ocean', 'forest-glow': 'Forest Glow',
  'sunset-dusk': 'Sunset Dusk', blueprint: 'Blueprint', 'paper-atlas': 'Paper Atlas',
  'mono-fog': 'Mono Fog', 'clean-light': 'Clean Light',
};

const dateInputValue = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const shiftYears = (timestamp: number, years: number) => {
  const date = new Date(timestamp);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.getTime();
};
const initialOneYearRange = (timeline: NormalizedTimeline) => {
  const sourceStart = Date.parse(timeline.summary.startTime);
  const end = Date.parse(timeline.summary.endTime);
  return {start: Math.max(sourceStart, shiftYears(end, -1)), end};
};
const configForSample = (scenario: ScenarioDefinition, locale: SupportedLocale) => {
  const range = initialOneYearRange(scenario.timeline);
  const value = defaultVideoConfig(range.start, range.end);
  value.labels.title = scenario.title[locale];
  value.labels.subtitle = scenario.description[locale];
  value.labels.showSubtitle = true;
  return value;
};
const formatPlayerTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
};

export function TimelineEditor() {
  const {t, i18n} = useTranslation();
  const locale: SupportedLocale = i18n.resolvedLanguage === 'en' ? 'en' : 'ko';
  const [workflow, sendWorkflow] = useMachine(studioMachine);
  const [timeline, setTimeline] = useState<NormalizedTimeline>(defaultSampleScenario.timeline);
  const [userTimeline, setUserTimeline] = useState<NormalizedTimeline | null>(null);
  const [activeSource, setActiveSource] = useState(defaultSampleScenario.id);
  const [config, setConfig] = useState<VideoConfig>(() => configForSample(defaultSampleScenario, 'ko'));
  const [tab, setTab] = useState<Tab>('story');
  const [notice, setNotice] = useState('');
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState('My timeline');
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [capability, setCapability] = useState<BrowserRenderCapability | null>(null);
  const [renderState, setRenderState] = useState<RenderState>({status: 'idle', progress: 0, encodedFrames: 0, estimatedMilliseconds: 0});
  const [storageInfo, setStorageInfo] = useState<{usage: number; quota: number; persisted: boolean} | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mapRevision, setMapRevision] = useState(0);
  const playerRef = useRef<PlayerRef>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const initialLocaleRef = useRef(locale);
  const initialTranslationRef = useRef(t);
  const mapRuntimeState = useMapRuntimeState();

  const refreshPresets = useCallback(async () => setPresets(await listPresets()), []);
  const refreshStorageInfo = useCallback(async () => {
    if (!navigator.storage) return;
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);
    setStorageInfo({usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted});
  }, []);

  useEffect(() => {
    let active = true;
    void withTimeout(Promise.all([readActiveTimeline(), listPresets()]), 5_000, 'Local data took too long to open. The sample remains available.').then(([record, savedPresets]) => {
      if (!active) return;
      const settings = loadStoredSettings();
      setPresetName(settings.presetName);
      setPresets(savedPresets);
      if (record) {
        const range = initialOneYearRange(record.timeline);
        setUserTimeline(record.timeline);
        setActiveSource('__user__');
        setTimeline(record.timeline);
        setConfig(configForTimeline(settings, record.sourceHash, range.start, range.end));
        setNotice(initialTranslationRef.current('notice.ready', {count: record.timeline.points.length.toLocaleString(initialLocaleRef.current === 'ko' ? 'ko-KR' : 'en-US')}));
      }
      sendWorkflow({type: 'BOOT_SUCCESS'});
      void refreshStorageInfo();
    }).catch((error) => {
      if (!active) return;
      setNotice(error instanceof Error ? error.message : initialTranslationRef.current('upload.failure'));
      sendWorkflow({type: 'BOOT_FAILURE'});
    });
    return () => { active = false; };
  }, [refreshStorageInfo, sendWorkflow]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !timeline) return;
    const frameListener = ({detail}: {detail: {frame: number}}) => setCurrentFrame(detail.frame);
    const playListener = () => setPlaying(true);
    const pauseListener = () => setPlaying(false);
    player.addEventListener('frameupdate', frameListener);
    player.addEventListener('play', playListener);
    player.addEventListener('pause', pauseListener);
    player.addEventListener('ended', pauseListener);
    return () => {
      player.removeEventListener('frameupdate', frameListener);
      player.removeEventListener('play', playListener);
      player.removeEventListener('pause', pauseListener);
      player.removeEventListener('ended', pauseListener);
    };
  }, [timeline]);

  useEffect(() => {
    if (activeSource !== '__user__') return;
    saveStoredSettings({version: 5, locale, presetName, sourceHash: timeline.summary.sourceHash, config});
  }, [activeSource, config, locale, presetName, timeline]);

  useEffect(() => {
    if (mapRuntimeState.status !== 'ready') playerRef.current?.pause();
    if (mapRuntimeState.status === 'loading') sendWorkflow({type: 'MAP_LOADING'});
    else if (mapRuntimeState.status === 'ready') sendWorkflow({type: 'MAP_READY'});
    else if (mapRuntimeState.status === 'error' || mapRuntimeState.status === 'reload-required') sendWorkflow({type: 'MAP_FAILURE'});
  }, [mapRuntimeState.status, sendWorkflow]);

  const renderOutput = config.output;
  useEffect(() => {
    let active = true;
    setCapability(null);
    void checkBrowserRenderCapability(renderOutput).then((result) => {if (active) setCapability(result);}).catch((error) => {
      if (active) setCapability({canRender: false, messages: [error instanceof Error ? error.message : t('render.unsupported')]});
    });
    return () => { active = false; };
  }, [renderOutput, t]);

  const track = useMemo(() => getPreparedPlaybackTrack(timeline, config), [config, timeline]);
  const onPlayerKeyDown = useEditorShortcuts({playerRef, track, fps: config.output.fps, setPlaybackRate, setShortcutsOpen});

  const update: Update = (section, value) => setConfig((current) => ({...current, [section]: {...current[section], ...value}}));

  const importHistory = async (file?: File) => {
    if (!file) return;
    if (file.size > 250 * 1024 * 1024) {setNotice(t('upload.invalidSize')); return;}
    setNotice(t('upload.importing'));
    sendWorkflow({type: 'IMPORT_START'});
    try {
      const imported = await importTimelineFile(file);
      const range = initialOneYearRange(imported.timeline);
      const nextConfig = defaultVideoConfig(range.start, range.end);
      let persisted = true;
      try {
        await writeActiveTimeline({sourceName: imported.timeline.summary.sourceName, sourceHash: imported.timeline.summary.sourceHash, importedAt: new Date().toISOString(), sourceEncoding: imported.sourceEncoding, source: imported.source, timeline: imported.timeline});
        await navigator.storage.persist?.();
      } catch {persisted = false;}
      setTimeline(imported.timeline);
      setUserTimeline(imported.timeline);
      setActiveSource('__user__');
      setConfig(nextConfig);
      setCurrentFrame(0);
      playerRef.current?.seekTo(0);
      saveStoredSettings({version: 5, locale, presetName, sourceHash: imported.timeline.summary.sourceHash, config: nextConfig});
      const count = imported.timeline.points.length.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US');
      setNotice(persisted ? t('notice.imported', {count}) : `${t('notice.ready', {count})} · ${t('storage.bestEffort')}`);
      sendWorkflow({type: 'IMPORT_SUCCESS'});
      await refreshStorageInfo();
    } catch (error) {
      setNotice(error instanceof TimelineImportError ? t(`upload.errors.${error.code}`) : t('upload.failure'));
      sendWorkflow({type: 'IMPORT_FAILURE'});
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveCurrentPreset = async () => {
    const preset = await savePreset(presetName, config);
    setNotice(t('notice.presetSaved', {name: preset.name}));
    await refreshPresets();
  };

  const loadPreset = (preset: SavedPreset) => {
    const sourceStart = Date.parse(timeline.summary.startTime);
    const sourceEnd = Date.parse(timeline.summary.endTime);
    const start = Math.max(sourceStart, Math.min(sourceEnd, preset.config.range.start));
    const end = Math.max(start, Math.max(sourceStart, Math.min(sourceEnd, preset.config.range.end)));
    setConfig({...preset.config, range: {start, end}});
    setPresetName(preset.name);
    setNotice(t('notice.presetLoaded', {name: preset.name}));
  };

  const startRender = async () => {
    if (!capability?.canRender) return;
    const outputName = renderOutputName();
    let writable: WritableStream | null = null;
    try {writable = await requestVideoWritable(outputName);} catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    }
    const controller = new AbortController();
    renderAbortRef.current = controller;
    sendWorkflow({type: 'RENDER_START'});
    playerRef.current?.pause();
    setRenderState({status: 'preparing', progress: 0, encodedFrames: 0, estimatedMilliseconds: 0});
    try {
      await renderTimelineInBrowser({timeline, config, locale, runtime: {}, outputName, outputWritable: writable, signal: controller.signal, onProgress: (progress) => setRenderState({status: 'rendering', ...progress})});
      setRenderState((current) => ({...current, status: 'completed', progress: 1, estimatedMilliseconds: 0}));
      sendWorkflow({type: 'RENDER_SUCCESS'});
    } catch (error) {
      if (controller.signal.aborted) {setRenderState({status: 'idle', progress: 0, encodedFrames: 0, estimatedMilliseconds: 0}); sendWorkflow({type: 'RENDER_CANCEL'});}
      else {setRenderState((current) => ({...current, status: 'failed', error: error instanceof Error ? error.message : t('render.failed')})); sendWorkflow({type: 'RENDER_FAILURE'});}
    } finally {renderAbortRef.current = null;}
  };

  const changeLocale = async () => {
    const next: SupportedLocale = locale === 'ko' ? 'en' : 'ko';
    if (activeSource !== '__user__') {
      const scenario = sampleScenarioById(activeSource);
      setConfig((current) => ({...current, labels: {...current.labels, title: scenario.title[next], subtitle: scenario.description[next]}}));
    }
    updateStoredLocale(next);
    document.documentElement.lang = next;
    await i18n.changeLanguage(next);
  };
  const resetSettings = () => {
    const range = initialOneYearRange(timeline);
    setConfig(defaultVideoConfig(range.start, range.end));
    setCurrentFrame(0);
    playerRef.current?.seekTo(0);
  };
  const removeHistory = async () => {
    renderAbortRef.current?.abort();
    playerRef.current?.pause();
    await withTimeout(deleteActiveTimeline(), 3_000, 'Timeline deletion timed out.').catch((error) => setNotice(error instanceof Error ? error.message : 'Timeline deletion failed.'));
    const settings = loadStoredSettings();
    saveStoredSettings({version: 5, locale: settings.locale, presetName: settings.presetName});
    setUserTimeline(null);
    setActiveSource(defaultSampleScenario.id);
    setTimeline(defaultSampleScenario.timeline);
    setConfig(configForSample(defaultSampleScenario, locale));
    setStorageOpen(false);
    await refreshStorageInfo();
  };
  const clearMapCache = async () => {
    await withTimeout((async () => {for (const key of await caches.keys()) if (key.startsWith('ugtt-map-')) await caches.delete(key);})(), 5_000, 'Map cache deletion timed out.');
    setMapRevision((value) => value + 1);
    await refreshStorageInfo();
    setNotice(t('storage.done'));
  };
  const clearAll = async () => {
    renderAbortRef.current?.abort();
    clearStoredSettings();
    await Promise.allSettled([
      withTimeout(clearDatabase(), 3_000, 'Local database deletion timed out.'),
      withTimeout((async () => {for (const key of await caches.keys()) await caches.delete(key);})(), 5_000, 'Cache deletion timed out.'),
    ]);
    window.location.reload();
  };

  const selectSource = (sourceId: string) => {
    if (sourceId === '__user__' && userTimeline) {
      const settings = loadStoredSettings();
      const range = initialOneYearRange(userTimeline);
      setActiveSource('__user__');
      setTimeline(userTimeline);
      setConfig(configForTimeline(settings, userTimeline.summary.sourceHash, range.start, range.end));
      setNotice(t('notice.ready', {count: userTimeline.points.length.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')}));
      return;
    }
    const scenario = sampleScenarioById(sourceId);
    setActiveSource(scenario.id);
    setTimeline(scenario.timeline);
    setConfig(configForSample(scenario, locale));
    setPresetName(scenario.title[locale]);
    setCurrentFrame(0);
    playerRef.current?.seekTo(0);
    setNotice(scenario.description[locale]);
  };

  const dropTimeline = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void importHistory(event.dataTransfer.files[0]);
  };

  const dimensions = outputDimensions(config);
  const portraitOutput = dimensions.height > dimensions.width;
  const currentPlaybackSample = samplePlayback(track, currentFrame);
  const runtime = {revision: mapRevision};
  const tabs: Array<{id: Tab; label: string; icon: typeof CalendarDays}> = [
    {id: 'story', label: t('tabs.story'), icon: CalendarDays}, {id: 'marker', label: t('tabs.marker'), icon: MapPinned},
    {id: 'trail', label: t('tabs.trail'), icon: Activity}, {id: 'map', label: t('tabs.map'), icon: Map},
    {id: 'labels', label: t('tabs.labels'), icon: Tag}, {id: 'output', label: t('tabs.output'), icon: Film},
  ];

  return <Tooltip.Provider delayDuration={350} skipDelayDuration={120}>
    <main className="studio-shell" onDragEnter={(event) => {event.preventDefault(); setDragging(true);}} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);}} onDrop={dropTimeline}>
      <header className="studio-header"><Brand /><div className="source-status"><Check size={14} /><select aria-label={locale === 'ko' ? 'Timeline 또는 샘플 선택' : 'Choose Timeline or sample'} value={activeSource} onChange={(event) => selectSource(event.target.value)}>{userTimeline ? <option value="__user__">{userTimeline.summary.sourceName}</option> : null}<optgroup label={locale === 'ko' ? '합성 샘플' : 'Synthetic samples'}>{sampleScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title[locale]}</option>)}</optgroup></select><em aria-live="polite">{workflow.matches({source: 'importing'}) ? t('upload.importing') : notice || (workflow.matches({boot: 'loading'}) ? t('common.loading') : '')}</em></div><div className="header-actions">
        <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importHistory(event.target.files?.[0])} />
        <ToolButton help={t('upload.format')} onClick={() => fileRef.current?.click()}><FolderOpen size={16} />{t('header.data')}</ToolButton>
        <ToolButton help={t('tooltip.storage')} onClick={() => setStorageOpen(true)}><Database size={16} />{t('header.settings')}</ToolButton>
        <ToolButton onClick={() => setHelpOpen(true)}><CircleHelp size={16} />{t('header.help')}</ToolButton>
        <ToolButton onClick={() => void changeLocale()}><Languages size={16} />{locale === 'ko' ? 'EN' : '한국어'}</ToolButton>
        <ToolButton onClick={() => void saveCurrentPreset()}><Save size={16} />{t('header.savePreset')}</ToolButton>
        <button className="button-primary" disabled={!capability?.canRender || mapRuntimeState.status !== 'ready' || ['preparing', 'rendering'].includes(renderState.status)} onClick={() => void startRender()}>{['preparing', 'rendering'].includes(renderState.status) ? <LoaderCircle className="spin" size={16} /> : <Clapperboard size={16} />}{t('header.export')}</button>
      </div></header>
      <section className="studio-body"><div ref={workspaceRef} className="workspace" tabIndex={0} aria-label={locale === 'ko' ? '영상 플레이어 작업 영역' : 'Video player workspace'} aria-keyshortcuts="Space K J L ArrowLeft ArrowRight Home End F ?" onKeyDown={onPlayerKeyDown} onPointerDown={(event) => {if (!(event.target as HTMLElement).closest('button,input,select,textarea')) event.currentTarget.focus({preventScroll: true});}}><div className="player-stage"><div className={`player-frame ${portraitOutput ? 'portrait' : 'landscape'}`} style={{aspectRatio: `${dimensions.width}/${dimensions.height}`}}><Player ref={playerRef} component={TimelineVideo} inputProps={{timeline, config, runtime, locale, reportMapRuntime: true}} durationInFrames={track.durationInFrames} fps={config.output.fps} compositionWidth={dimensions.width} compositionHeight={dimensions.height} style={{width: '100%', height: '100%'}} acknowledgeRemotionLicense loop playbackRate={playbackRate} errorFallback={({error}: {error: Error}) => <div className="player-error">{error.message}</div>} /></div><div className="canvas-badge">{config.output.aspectRatio} · {config.output.resolution} · {config.output.fps} FPS</div></div><EditorTransport playerRef={playerRef} track={track} config={config} currentFrame={currentFrame} playing={playing} playbackRate={playbackRate} setPlaybackRate={setPlaybackRate} currentDate={currentPlaybackSample?.point.timestamp ?? config.range.start} onShortcuts={() => setShortcutsOpen(true)} /></div>
        <aside className="inspector"><nav className="inspector-tabs">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} aria-label={item.label}><item.icon size={17} /><span>{item.label}</span></button>)}</nav><div className="inspector-content">{tab === 'story' && <StoryPanel config={config} timeline={timeline} update={update} />}{tab === 'marker' && <MarkerPanel config={config} update={update} />}{tab === 'trail' && <TrailPanel config={config} update={update} />}{tab === 'map' && <MapPanel config={config} update={update} mapStatus={mapRuntimeState} retryMap={() => {sendWorkflow({type: 'MAP_RETRY'}); setMapRevision((value) => value + 1);}} />}{tab === 'labels' && <LabelsPanel config={config} update={update} />}{tab === 'output' && <OutputPanel config={config} update={update} capability={capability} renderState={renderState} cancel={() => renderAbortRef.current?.abort()} />}</div><PresetShelf presets={presets} name={presetName} setName={setPresetName} load={loadPreset} refresh={refreshPresets} /></aside>
      </section>
      {dragging ? <div className="studio-drop-overlay"><Upload size={28} /><strong>{t('upload.drop')}</strong><span>{t('upload.format')}</span></div> : null}
    </main>
    <HelpDialog open={helpOpen} setOpen={setHelpOpen} /><ShortcutsDialog open={shortcutsOpen} setOpen={setShortcutsOpen} /><StorageDialog open={storageOpen} setOpen={setStorageOpen} storageInfo={storageInfo} resetSettings={resetSettings} deletePresets={async () => {await deleteAllPresets(); await refreshPresets();}} deleteHistory={removeHistory} clearMap={clearMapCache} clearAll={clearAll} />
  </Tooltip.Provider>;
}

function Brand() {const {t} = useTranslation(); return <div className="brand-lockup"><i /><div><h1>{t('product.name')}</h1><span>{t('product.description')}</span></div></div>;}
function PanelTitle({section}: {section: 'story' | 'marker' | 'trail' | 'map' | 'labels' | 'output'}) {const {t} = useTranslation(); return <div className="panel-title"><span>{t(`panels.${section}.eyebrow`)}</span><h2>{t(`panels.${section}.title`)}</h2><p>{t(`panels.${section}.copy`)}</p></div>;}

function StoryPanel({config, timeline, update}: {config: VideoConfig; timeline: NormalizedTimeline; update: Update}) {
  const {t} = useTranslation(); const sourceStart = Date.parse(timeline.summary.startTime); const sourceEnd = Date.parse(timeline.summary.endTime); const endDate = new Date(sourceEnd);
  const quickRanges = [{label: t('ranges.all'), start: sourceStart, end: sourceEnd}, {label: t('ranges.year'), start: Math.max(sourceStart, shiftYears(sourceEnd, -1)), end: sourceEnd}, {label: t('ranges.thisYear'), start: Math.max(sourceStart, Date.UTC(endDate.getUTCFullYear(), 0, 1)), end: sourceEnd}, {label: t('ranges.month'), start: Math.max(sourceStart, Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)), end: sourceEnd}, {label: t('ranges.days30'), start: Math.max(sourceStart, sourceEnd - 30 * 86_400_000), end: sourceEnd}];
  const resolvedDuration = resolvePlaybackDuration(timeline.points, config);
  return <><PanelTitle section="story" /><div className="quick-ranges">{quickRanges.map((range) => <button key={range.label} className={Math.abs(config.range.start - range.start) < 86_400_000 && Math.abs(config.range.end - range.end) < 86_400_000 ? 'active' : ''} onClick={() => update('range', {start: range.start, end: range.end})}>{range.label}</button>)}</div><Field label={t('controls.startDate')}><DateField key={`start-${config.range.start}`} value={config.range.start} min={sourceStart} max={config.range.end} onCommit={(start) => update('range', {start})} /></Field><Field label={t('controls.endDate')}><DateField key={`end-${config.range.end}`} value={config.range.end} min={config.range.start} max={sourceEnd} endOfDay onCommit={(end) => update('range', {end})} /></Field>
    <Segmented label={t('controls.timing')} help={t('tooltip.timing')} value={config.playback.mode} options={[["cinematic", t('controls.cinematic')], ["fixed-duration", t('controls.fixedDuration')]]} onChange={(mode) => update('playback', {mode: mode as VideoConfig['playback']['mode']})} />{config.playback.mode === 'fixed-duration' ? <Range label={t('controls.duration')} value={config.playback.durationSeconds} min={10} max={600} step={5} suffix="s" onChange={(durationSeconds) => update('playback', {durationSeconds})} /> : <Range label={t('controls.density')} value={config.playback.cinematicDensity} min={0.5} max={2} step={0.05} onChange={(cinematicDensity) => update('playback', {cinematicDensity})} />}<Range label={t('controls.distanceInfluence')} help={t('tooltip.distanceInfluence')} value={Math.round(config.playback.distanceInfluence * 100)} min={0} max={100} step={1} suffix="%" onChange={(distanceInfluence) => update('playback', {distanceInfluence: distanceInfluence / 100})} /><Range label={t('controls.destinationHold')} value={config.playback.destinationHoldSeconds} min={0} max={15} step={0.5} suffix="s" onChange={(destinationHoldSeconds) => update('playback', {destinationHoldSeconds})} /><div className="calculated-duration"><span>{t('controls.calculatedDuration')}</span><strong>{formatPlayerTime(resolvedDuration)}</strong></div>
    <Segmented label={t('controls.camera')} help={t('tooltip.camera')} value={config.camera.mode} options={[["adaptive", t('controls.adaptive')], ["follow", t('controls.follow')], ["fixed", t('controls.fixed')]]} onChange={(mode) => update('camera', {mode: mode as VideoConfig['camera']['mode']})} /><Range label={t('controls.maxZoom')} value={config.camera.zoom} min={2} max={12} step={0.5} onChange={(zoom) => update('camera', {zoom})} /><Range label={t('controls.smoothing')} value={config.camera.smoothing} min={0} max={1} step={0.05} onChange={(smoothing) => update('camera', {smoothing})} />{config.camera.mode !== 'fixed' ? <Range label={t('controls.anticipation')} help={t('tooltip.anticipation')} value={config.camera.anticipationSeconds} min={0.5} max={10} step={0.5} suffix="s" onChange={(anticipationSeconds) => update('camera', {anticipationSeconds})} /> : null}{config.camera.mode === 'adaptive' ? <Range label={t('controls.framing')} value={Math.round(config.camera.framing * 100)} min={15} max={50} step={1} suffix="%" onChange={(framing) => update('camera', {framing: framing / 100})} /> : null}</>;
}

function MarkerPanel({config, update}: {config: VideoConfig; update: Update}) {const {t} = useTranslation(); return <><PanelTitle section="marker" /><Segmented label={t('controls.markerType')} help={t('tooltip.emoji')} value={config.marker.type} options={[["emoji", t('controls.emoji')], ["circle", t('controls.circle')]]} onChange={(type) => update('marker', {type: type as VideoConfig['marker']['type']})} /><Range label={t('controls.size')} value={config.marker.size} min={24} max={72} step={1} suffix="px" onChange={(size) => update('marker', {size})} /><Field label={t('controls.accent')}><input type="color" value={config.marker.color} onChange={(event) => update('marker', {color: event.target.value})} /></Field></>;}
function TrailPanel({config, update}: {config: VideoConfig; update: Update}) {const {t} = useTranslation(); return <><PanelTitle section="trail" /><Toggle label={t('controls.accumulated')} checked={config.trail.showAccumulated} onChange={(showAccumulated) => update('trail', {showAccumulated})} /><Range label={t('controls.opacity')} value={config.trail.accumulatedOpacity} min={0.05} max={0.8} step={0.05} onChange={(accumulatedOpacity) => update('trail', {accumulatedOpacity})} /><Range label={t('controls.recentTrail')} value={config.trail.recentDurationSeconds} min={1} max={15} step={0.5} suffix="s" onChange={(recentDurationSeconds) => update('trail', {recentDurationSeconds})} /><Range label={t('controls.lineWidth')} value={config.trail.width} min={1} max={12} step={0.5} suffix="px" onChange={(width) => update('trail', {width})} /><Segmented label={t('controls.trailColor')} value={config.trail.colorMode} options={[["activity", t('controls.activity')], ["single", t('controls.single')]]} onChange={(colorMode) => update('trail', {colorMode: colorMode as VideoConfig['trail']['colorMode']})} /></>;}

function MapPanel({config, update, mapStatus, retryMap}: {config: VideoConfig; update: Update; mapStatus: ReturnType<typeof useMapRuntimeState>; retryMap: () => void}) {
  const {t} = useTranslation();
  const changePreset = (stylePreset: VideoConfig['map']['stylePreset']) => update('map', {stylePreset, colors: paletteByPreset[stylePreset]});
  return <><PanelTitle section="map" /><div className={`map-source-state state-${mapStatus.status}`}><Map size={15} /><div><strong>{t('map.source')}</strong><span>{mapStatus.message || t('map.idle')}</span></div>{mapStatus.status === 'reload-required' || mapStatus.status === 'error' ? <button onClick={retryMap}>{t('map.reloadAction')}</button> : null}</div><Field label={t('controls.mapStyle')}><select value={config.map.stylePreset} onChange={(event) => changePreset(event.target.value as VideoConfig['map']['stylePreset'])}>{Object.entries(mapStyleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></Field><Segmented label={t('controls.mapLabels')} value={config.map.labelDensity} options={[["none", t('controls.none')], ["major", t('controls.major')], ["full", t('controls.full')]]} onChange={(labelDensity) => update('map', {labelDensity: labelDensity as VideoConfig['map']['labelDensity']})} /><Toggle label={t('controls.poi')} checked={config.map.showPoi} onChange={(showPoi) => update('map', {showPoi})} /><Range label={t('controls.saturation')} value={config.map.saturation} min={-1} max={1} step={0.05} onChange={(saturation) => update('map', {saturation})} /><Range label={t('controls.brightness')} value={config.map.brightness} min={-0.5} max={0.5} step={0.05} onChange={(brightness) => update('map', {brightness})} /><div className="color-grid">{Object.entries(config.map.colors).map(([key, value]) => <Field key={key} label={t(`controls.${key}`)}><input type="color" value={value} onChange={(event) => update('map', {colors: {...config.map.colors, [key]: event.target.value}})} /></Field>)}</div><p className="legal-note">{t('legal.map')}</p></>;
}
function LabelsPanel({config, update}: {config: VideoConfig; update: Update}) {const {t} = useTranslation(); const positions: Array<[VideoConfig['labels']['position'], string]> = [['top-left', t('controls.topLeft')], ['top-center', t('controls.topCenter')], ['top-right', t('controls.topRight')], ['middle-left', t('controls.middleLeft')], ['middle-right', t('controls.middleRight')], ['bottom-left', t('controls.bottomLeft')], ['bottom-center', t('controls.bottomCenter')], ['bottom-right', t('controls.bottomRight')]]; return <><PanelTitle section="labels" /><Field label={t('controls.journeyTitle')}><input value={config.labels.title} maxLength={80} onChange={(event) => update('labels', {title: event.target.value})} /></Field><Field label={t('controls.journeySubtitle')}><input value={config.labels.subtitle} maxLength={120} onChange={(event) => update('labels', {subtitle: event.target.value})} /></Field><Toggle label={t('controls.showTitle')} checked={config.labels.showTitle} onChange={(showTitle) => update('labels', {showTitle})} /><Toggle label={t('controls.showSubtitle')} checked={config.labels.showSubtitle} onChange={(showSubtitle) => update('labels', {showSubtitle})} /><Segmented label={t('controls.labelStyle')} value={config.labels.style} options={[["minimal", t('controls.minimal')], ["panel", t('controls.panel')], ["cinematic", t('controls.cinematicLabel')]]} onChange={(style) => update('labels', {style: style as VideoConfig['labels']['style']})} />{([['date', 'date'], ['time', 'time'], ['activity', 'activity'], ['distance', 'distance'], ['progress', 'progress']] as const).map(([key, label]) => <Toggle key={key} label={t(`controls.${label}`)} checked={config.labels[key]} onChange={(checked) => update('labels', {[key]: checked})} />)}<Field label={t('controls.position')}><select value={config.labels.position} onChange={(event) => update('labels', {position: event.target.value as VideoConfig['labels']['position']})}>{positions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Segmented label={t('controls.size')} value={config.labels.size} options={[["compact", t('controls.compact')], ["regular", t('controls.regular')]]} onChange={(size) => update('labels', {size: size as VideoConfig['labels']['size']})} /><p className="legal-note">{t('legal.attribution')}</p></>;}

function OutputPanel({config, update, capability, renderState, cancel}: {config: VideoConfig; update: Update; capability: BrowserRenderCapability | null; renderState: RenderState; cancel: () => void}) {const {t} = useTranslation(); const active = ['preparing', 'rendering'].includes(renderState.status); return <><PanelTitle section="output" /><Segmented label={t('controls.aspect')} value={config.output.aspectRatio} options={[["16:9", t('controls.landscape')], ["9:16", t('controls.portrait')], ["1:1", t('controls.square')]]} onChange={(aspectRatio) => update('output', {aspectRatio: aspectRatio as VideoConfig['output']['aspectRatio']})} /><Segmented label={t('controls.resolution')} value={config.output.resolution} options={[["1080p", '1080p'], ["4k", '4K']]} onChange={(resolution) => update('output', {resolution: resolution as VideoConfig['output']['resolution']})} /><Segmented label={t('controls.frameRate')} value={String(config.output.fps)} options={[["30", '30 FPS'], ["60", '60 FPS']]} onChange={(fps) => update('output', {fps: Number(fps) as 30 | 60})} /><div className={`render-capability ${capability?.canRender ? 'supported' : 'unsupported'}`}><Gauge size={16} /><div><strong>{capability ? (capability.canRender ? t('render.ready') : t('render.unsupported')) : t('render.checking')}</strong>{capability?.messages.map((message) => <span key={message}>{message}</span>)}</div></div>{renderState.status !== 'idle' ? <div className={`render-progress status-${renderState.status}`}><div>{active ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}<strong>{t(`render.${renderState.status}`)}</strong><span>{Math.round(renderState.progress * 100)}%</span></div><i><b style={{width: `${renderState.progress * 100}%`}} /></i>{renderState.estimatedMilliseconds > 0 ? <small>{t('render.eta', {time: formatPlayerTime(renderState.estimatedMilliseconds / 1000)})} · {renderState.encodedFrames.toLocaleString()} frames</small> : null}{renderState.error ? <small>{renderState.error}</small> : null}{active ? <button onClick={cancel}><X size={13} />{t('render.cancel')}</button> : null}</div> : null}</>;}
function PresetShelf({presets, name, setName, load, refresh}: {presets: SavedPreset[]; name: string; setName: (value: string) => void; load: (preset: SavedPreset) => void; refresh: () => Promise<void>}) {const {t} = useTranslation(); return <div className="preset-shelf"><label><span>{t('controls.presetName')}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>{presets.length ? <details><summary><Settings2 size={14} />{t('controls.savedPresets', {count: presets.length})}<ChevronDown size={14} /></summary><div>{presets.map((preset) => <div key={preset.id}><button onClick={() => load(preset)}>{preset.name}</button><button aria-label={t('common.delete')} onClick={async () => {await deletePreset(preset.id); await refresh();}}><Trash2 size={13} /></button></div>)}</div></details> : null}</div>;}

function ToolButton({help, children, onClick}: {help?: string; children: React.ReactNode; onClick: () => void}) {const button = <button className="button-ghost" onClick={onClick}>{children}</button>; return help ? <Tooltip.Root><Tooltip.Trigger asChild>{button}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip-content" sideOffset={7}>{help}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root> : button;}

function DateField({id, value, min, max, endOfDay = false, onCommit}: {id?: string; value: number; min: number; max: number; endOfDay?: boolean; onCommit: (value: number) => void}) {const [text, setText] = useState(dateInputValue(value)); const [invalid, setInvalid] = useState(false); const commit = () => {if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {setInvalid(true); return;} const timestamp = Date.parse(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`); if (!Number.isFinite(timestamp) || dateInputValue(timestamp) !== text || text < dateInputValue(min) || text > dateInputValue(max)) {setInvalid(true); return;} setInvalid(false); onCommit(timestamp);}; return <input id={id} className={invalid ? 'date-text invalid' : 'date-text'} value={text} inputMode="numeric" placeholder="YYYY-MM-DD" aria-label="YYYY-MM-DD" onChange={(event) => {setText(event.target.value); setInvalid(false);}} onBlur={commit} onKeyDown={(event) => {if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') {setText(dateInputValue(value)); setInvalid(false); event.currentTarget.blur();}}} />;}
