import {z} from 'zod';

export const activityTypes = [
  'walking',
  'running',
  'cycling',
  'in subway',
  'in bus',
  'in passenger vehicle',
  'in train',
  'in tram',
  'motorcycling',
  'skiing',
  'flying',
  'unknown',
] as const;

export type ActivityType = (typeof activityTypes)[number] | string;

export type TrackPoint = {
  id: string;
  timestamp: number;
  timezoneOffsetMinutes: number;
  latitude: number;
  longitude: number;
  activity: ActivityType;
  kind: 'path' | 'activity' | 'visit';
  breakBefore: boolean;
  cumulativeDistanceMeters: number;
};

export type TimelineSummary = {
  sourceName: string;
  sourceHash: string;
  startTime: string;
  endTime: string;
  totalSegments: number;
  totalPathPoints: number;
  activityCount: number;
  visitCount: number;
  pathCount: number;
  ignoredCount: number;
  invalidPointCount: number;
  distanceMeters: number;
};

export type NormalizedTimeline = {
  summary: TimelineSummary;
  points: TrackPoint[];
};

export const supportedLocales = ['ko', 'en'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const videoConfigSchema = z.object({
  range: z.object({start: z.number(), end: z.number()}),
  playback: z.object({
    mode: z.enum(['cinematic', 'fixed-duration']),
    durationSeconds: z.number().min(5).max(3600),
    cinematicDensity: z.number().min(0.5).max(2),
    distanceInfluence: z.number().min(0).max(1),
    destinationHoldSeconds: z.number().min(0).max(20),
  }),
  map: z.object({
    stylePreset: z.enum(['night-pulse', 'paper-atlas', 'mono-fog', 'deep-ocean', 'forest-glow', 'sunset-dusk', 'blueprint', 'clean-light']),
    labelDensity: z.enum(['none', 'major', 'full']),
    showPoi: z.boolean(),
    saturation: z.number().min(-1).max(1),
    brightness: z.number().min(-1).max(1),
    colors: z.object({
      land: z.string(),
      water: z.string(),
      road: z.string(),
      boundary: z.string(),
      text: z.string(),
    }),
  }),
  marker: z.object({
    type: z.enum(['emoji', 'circle']),
    size: z.number().min(20).max(72),
    color: z.string(),
  }),
  trail: z.object({
    showAccumulated: z.boolean(),
    accumulatedOpacity: z.number().min(0).max(1),
    recentDurationSeconds: z.number().min(0.5).max(30),
    width: z.number().min(1).max(16),
    colorMode: z.enum(['single', 'activity']),
  }).refine((value) => value.showAccumulated || value.recentDurationSeconds > 0, {
    message: '누적 경로와 이동 트레일 중 하나는 표시해야 합니다.',
  }),
  camera: z.object({
    mode: z.enum(['fixed', 'follow', 'adaptive']),
    zoom: z.number().min(1).max(16),
    smoothing: z.number().min(0).max(1),
    anticipationSeconds: z.number().min(0.5).max(10),
    framing: z.number().min(0.15).max(0.5),
  }),
  labels: z.object({
    title: z.string().max(80).default('나의 여정'),
    subtitle: z.string().max(120).default(''),
    showTitle: z.boolean().default(true),
    showSubtitle: z.boolean().default(false),
    date: z.boolean(),
    time: z.boolean(),
    activity: z.boolean(),
    distance: z.boolean(),
    progress: z.boolean(),
    position: z.enum(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']),
    style: z.enum(['minimal', 'panel', 'cinematic']).default('panel'),
    size: z.enum(['compact', 'regular']),
  }),
  output: z.object({
    aspectRatio: z.enum(['16:9', '9:16', '1:1']),
    resolution: z.enum(['1080p', '4k']),
    fps: z.union([z.literal(30), z.literal(60)]),
  }),
});

export type VideoConfig = z.infer<typeof videoConfigSchema>;

export const defaultVideoConfig = (start: number, end: number): VideoConfig => ({
  range: {start, end},
  playback: {mode: 'cinematic', durationSeconds: 90, cinematicDensity: 1, distanceInfluence: 0.65, destinationHoldSeconds: 5},
  map: {
    stylePreset: 'night-pulse',
    labelDensity: 'major',
    showPoi: false,
    saturation: -0.15,
    brightness: -0.08,
    colors: {land: '#182124', water: '#0c2028', road: '#506064', boundary: '#6f7a7d', text: '#c2cecc'},
  },
  marker: {type: 'emoji', size: 42, color: '#ffb45b'},
  trail: {
    showAccumulated: true,
    accumulatedOpacity: 0.28,
    recentDurationSeconds: 4,
    width: 4,
    colorMode: 'activity',
  },
  camera: {mode: 'adaptive', zoom: 10, smoothing: 0.72, anticipationSeconds: 8, framing: 0.3},
  labels: {
    title: '나의 여정',
    subtitle: '',
    showTitle: true,
    showSubtitle: false,
    date: true,
    time: false,
    activity: true,
    distance: true,
    progress: true,
    position: 'top-left',
    style: 'panel',
    size: 'regular',
  },
  output: {aspectRatio: '16:9', resolution: '1080p', fps: 30},
});

export const outputDimensions = (config: Pick<VideoConfig, 'output'>) => {
  const long = config.output.resolution === '4k' ? 3840 : 1920;
  const short = config.output.resolution === '4k' ? 2160 : 1080;
  if (config.output.aspectRatio === '9:16') return {width: short, height: long};
  if (config.output.aspectRatio === '1:1') return {width: short, height: short};
  return {width: long, height: short};
};
