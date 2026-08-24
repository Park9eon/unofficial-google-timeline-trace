// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {defaultVideoConfig} from '@/domain/timeline';
import {clearDatabase, readActiveTimeline, writeActiveTimeline} from './database';
import {clearStoredSettings, loadStoredSettings} from './settings';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(window, 'localStorage', {configurable: true, value: storage});
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage});
});

afterEach(async () => {
  clearStoredSettings();
  await clearDatabase();
});

describe('browser persistence', () => {
  it('stores and restores the active normalized Timeline atomically', async () => {
    const timeline = {
      summary: {sourceName: 'sample.json', sourceHash: 'hash', startTime: new Date(0).toISOString(), endTime: new Date(1000).toISOString(), totalSegments: 1, totalPathPoints: 1, activityCount: 0, visitCount: 1, pathCount: 0, ignoredCount: 0, invalidPointCount: 0, distanceMeters: 0},
      points: [{id: 'point', timestamp: 0, timezoneOffsetMinutes: 0, latitude: 37, longitude: 127, activity: 'visit', kind: 'visit' as const, breakBefore: false, cumulativeDistanceMeters: 0}],
    };
    await writeActiveTimeline({sourceName: 'sample.json', sourceHash: 'hash', importedAt: new Date(0).toISOString(), sourceEncoding: 'identity', source: new Blob(['[]']), timeline});
    expect((await readActiveTimeline())?.timeline).toEqual(timeline);
  });

  it('migrates the legacy v4 draft into the two timing modes and two marker types', () => {
    const current = defaultVideoConfig(0, 1000);
    const legacy = {
      ...current,
      playback: {mode: 'distance', durationMode: 'fixed', durationSeconds: 42, realDaysPerSecond: 7, kilometersPerSecond: 100, dynamicDensity: 1.2, distanceEmphasis: 0.4, minimumDestinationSeconds: 6},
      marker: {type: 'arrow', size: 36, color: '#abcdef', pulse: true},
    };
    localStorage.setItem('timeline-film-draft', JSON.stringify({version: 4, sourceHash: 'legacy', config: legacy}));
    const migrated = loadStoredSettings();
    expect(migrated.locale).toBe('ko');
    expect(migrated.config?.playback).toMatchObject({mode: 'fixed-duration', durationSeconds: 42, distanceInfluence: 1, cinematicDensity: 1.2, destinationHoldSeconds: 6});
    expect(migrated.config?.marker).toEqual({type: 'emoji', size: 36, color: '#abcdef'});
  });

});
