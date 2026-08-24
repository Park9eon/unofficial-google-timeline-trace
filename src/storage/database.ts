import Dexie, {type EntityTable} from 'dexie';
import type {NormalizedTimeline, VideoConfig} from '@/domain/timeline';

export type TimelineRecord = {
  id: 'active';
  schemaVersion: 1;
  parserVersion: 1;
  sourceName: string;
  sourceHash: string;
  importedAt: string;
  sourceEncoding: 'gzip' | 'identity';
  source: Blob;
  timeline: NormalizedTimeline;
};

export type SavedPreset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: VideoConfig;
};

class TimelineDatabase extends Dexie {
  timelines!: EntityTable<TimelineRecord, 'id'>;
  presets!: EntityTable<SavedPreset, 'id'>;

  constructor() {
    super('unofficial-google-timeline-trace');
    this.version(1).stores({
      timelines: 'id, sourceHash, importedAt',
      presets: 'id, updatedAt',
    });
    this.version(2).stores({
      timelines: 'id, sourceHash, importedAt',
      presets: 'id, updatedAt',
      mapPreparations: 'id, sourceHash, mapHash, updatedAt',
    });
    this.version(3).stores({
      timelines: 'id, sourceHash, importedAt',
      presets: 'id, updatedAt',
      mapPreparations: null,
    });
  }
}

let database: TimelineDatabase | null = null;

export const getTimelineDatabase = () => {
  if (typeof window === 'undefined') throw new Error('Browser storage is only available in the browser.');
  database ??= new TimelineDatabase();
  return database;
};

export const readActiveTimeline = () => getTimelineDatabase().timelines.get('active');

export const writeActiveTimeline = async (record: Omit<TimelineRecord, 'id' | 'schemaVersion' | 'parserVersion'>) => {
  const value: TimelineRecord = {id: 'active', schemaVersion: 1, parserVersion: 1, ...record};
  await getTimelineDatabase().transaction('rw', getTimelineDatabase().timelines, async () => {
    await getTimelineDatabase().timelines.put(value);
  });
  return value;
};

export const deleteActiveTimeline = () => getTimelineDatabase().timelines.delete('active');

export const listPresets = () => getTimelineDatabase().presets.orderBy('updatedAt').reverse().toArray();

export const savePreset = async (name: string, config: VideoConfig, id?: string) => {
  const table = getTimelineDatabase().presets;
  const previous = id ? await table.get(id) : undefined;
  const now = new Date().toISOString();
  const preset: SavedPreset = {
    id: id ?? crypto.randomUUID(),
    name: name.trim() || 'Untitled preset',
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    config,
  };
  await table.put(preset);
  return preset;
};

export const deletePreset = (id: string) => getTimelineDatabase().presets.delete(id);

export const deleteAllPresets = () => getTimelineDatabase().presets.clear();

export const clearDatabase = async () => {
  if (database) {
    database.close();
    await database.delete();
    database = null;
    return;
  }
  const temporary = new TimelineDatabase();
  await temporary.delete();
};
