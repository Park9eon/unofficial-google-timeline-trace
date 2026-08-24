// @vitest-environment jsdom

import {fireEvent, render} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {PlayerRef} from '@remotion/player';
import {useEditorShortcuts} from './EditorTransport';
import type {PlaybackTrack} from '@/domain/playback';

const track: PlaybackTrack = {durationInFrames: 300, phases: [], points: []};

function Harness({player}: {player: PlayerRef}) {
  const onKeyDown = useEditorShortcuts({playerRef: {current: player}, track, fps: 30, setPlaybackRate: vi.fn(), setShortcutsOpen: vi.fn()});
  return <><div data-testid="workspace" tabIndex={0} onKeyDown={onKeyDown}><input data-testid="form" /></div><input data-testid="outside" /></>;
}

describe('player shortcut scope', () => {
  it('handles shortcuts only in the player workspace and never from form controls', () => {
    const toggle = vi.fn();
    const player = {toggle, getCurrentFrame: () => 0, seekTo: vi.fn(), play: vi.fn(), requestFullscreen: vi.fn()} as unknown as PlayerRef;
    const view = render(<Harness player={player} />);
    fireEvent.keyDown(view.getByTestId('outside'), {key: ' '});
    fireEvent.keyDown(view.getByTestId('form'), {key: ' '});
    expect(toggle).not.toHaveBeenCalled();
    fireEvent.keyDown(view.getByTestId('workspace'), {key: ' '});
    expect(toggle).toHaveBeenCalledOnce();
  });
});
