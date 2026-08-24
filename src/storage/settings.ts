import {z} from 'zod';
import {defaultVideoConfig, videoConfigSchema, type SupportedLocale, type VideoConfig} from '@/domain/timeline';

const SETTINGS_KEY = 'ugtt:settings';
const LEGACY_KEY = 'timeline-film-draft';

const storedSettingsSchema = z.object({
  version: z.literal(5),
  locale: z.enum(['ko', 'en']),
  presetName: z.string(),
  sourceHash: z.string().optional(),
  config: videoConfigSchema.optional(),
});

export type StoredSettings = z.infer<typeof storedSettingsSchema>;

const migrateLegacyConfig = (value: unknown): VideoConfig | null => {
  if (!value || typeof value !== 'object') return null;
  const legacy = value as Record<string, unknown>;
  if (!legacy.range || !legacy.playback || !legacy.marker || typeof legacy.playback !== 'object' || typeof legacy.marker !== 'object') return null;
  const playback = legacy.playback as Record<string, unknown>;
  const marker = legacy.marker as Record<string, unknown>;
  const playbackMode = playback.durationMode === 'fixed' ? 'fixed-duration' : 'cinematic';
  const distanceInfluence = playback.mode === 'distance'
    ? 1
    : playback.mode === 'chronological'
      ? 0
      : Number(playback.distanceEmphasis ?? 0.65);
  const markerType = marker.type === 'dot' ? 'circle' : 'emoji';
  const migrated = {
    ...legacy,
    playback: {
      mode: playbackMode,
      durationSeconds: Number(playback.durationSeconds ?? 90),
      cinematicDensity: Number(playback.dynamicDensity ?? 1),
      distanceInfluence,
      destinationHoldSeconds: Number(playback.minimumDestinationSeconds ?? 5),
    },
    marker: {
      type: markerType,
      size: Math.max(20, Number(marker.size ?? 42)),
      color: String(marker.color ?? '#ffb45b'),
    },
  };
  const parsed = videoConfigSchema.safeParse(migrated);
  return parsed.success ? parsed.data : null;
};

const defaultSettings = (): StoredSettings => ({version: 5, locale: 'ko', presetName: 'My timeline'});

export const loadStoredSettings = (): StoredSettings => {
  if (typeof window === 'undefined') return defaultSettings();
  try {
    const parsed = storedSettingsSchema.safeParse(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? 'null'));
    if (parsed.success) return parsed.data;
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? 'null');
    const migrated = migrateLegacyConfig(legacy?.config);
    if (legacy?.version === 4 && migrated) {
      const settings: StoredSettings = {
        version: 5,
        locale: 'ko',
        presetName: 'My timeline',
        sourceHash: typeof legacy.sourceHash === 'string' ? legacy.sourceHash : undefined,
        config: migrated,
      };
      saveStoredSettings(settings);
      window.localStorage.removeItem(LEGACY_KEY);
      return settings;
    }
  } catch {}
  return defaultSettings();
};

export const saveStoredSettings = (settings: StoredSettings) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(storedSettingsSchema.parse(settings)));
};

export const clearStoredSettings = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SETTINGS_KEY);
  window.localStorage.removeItem(LEGACY_KEY);
};

export const configForTimeline = (settings: StoredSettings, sourceHash: string, start: number, end: number) => {
  if (settings.sourceHash === sourceHash && settings.config) return settings.config;
  return defaultVideoConfig(start, end);
};

export const updateStoredLocale = (locale: SupportedLocale) => {
  const settings = loadStoredSettings();
  saveStoredSettings({...settings, locale});
};
