// @vitest-environment jsdom

import {describe, expect, it, vi} from 'vitest';
import {withTimeout} from './async';

describe('async timeout', () => {
  it('rejects a never-settling operation and runs cleanup', async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn();
    const result = withTimeout(new Promise<never>(() => undefined), 1_000, 'Timed out', cleanup);
    const rejection = expect(result).rejects.toThrow('Timed out');
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(cleanup).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
