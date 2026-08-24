import {describe, expect, it} from 'vitest';
import {defaultVideoConfig, videoConfigSchema} from './timeline';

describe('video configuration', () => {
  it('requires at least one visible trail layer', () => {
    const config = defaultVideoConfig(0, 1000);
    config.trail.showAccumulated = false;
    config.trail.recentDurationSeconds = 0;
    expect(videoConfigSchema.safeParse(config).success).toBe(false);
  });

  it('accepts the complete default configuration', () => {
    expect(videoConfigSchema.safeParse(defaultVideoConfig(0, 1000)).success).toBe(true);
  });
});
