import {createActor} from 'xstate';
import {describe, expect, it} from 'vitest';
import {studioMachine} from './studio-machine';

describe('studio workflow', () => {
  it('keeps recovery controls available when boot and map fail independently', () => {
    const actor = createActor(studioMachine).start();
    actor.send({type: 'BOOT_FAILURE'});
    actor.send({type: 'MAP_LOADING'});
    actor.send({type: 'MAP_FAILURE'});
    expect(actor.getSnapshot().matches({boot: 'error'})).toBe(true);
    expect(actor.getSnapshot().matches({map: 'error'})).toBe(true);
    actor.send({type: 'BOOT_RETRY'});
    actor.send({type: 'BOOT_SUCCESS'});
    actor.send({type: 'MAP_RETRY'});
    actor.send({type: 'MAP_READY'});
    expect(actor.getSnapshot().matches({boot: 'ready'})).toBe(true);
    expect(actor.getSnapshot().matches({map: 'ready'})).toBe(true);
  });

  it('can cancel import and render without affecting other regions', () => {
    const actor = createActor(studioMachine).start();
    actor.send({type: 'IMPORT_START'}); actor.send({type: 'IMPORT_CANCEL'});
    actor.send({type: 'RENDER_START'}); actor.send({type: 'RENDER_CANCEL'});
    expect(actor.getSnapshot().matches({source: 'idle'})).toBe(true);
    expect(actor.getSnapshot().matches({render: 'idle'})).toBe(true);
  });

  it('retries the online map after a loading error', () => {
    const actor = createActor(studioMachine).start();
    actor.send({type: 'MAP_LOADING'});
    actor.send({type: 'MAP_FAILURE'});
    expect(actor.getSnapshot().matches({map: 'error'})).toBe(true);
    actor.send({type: 'MAP_RETRY'});
    expect(actor.getSnapshot().matches({map: 'loading'})).toBe(true);
  });
});
