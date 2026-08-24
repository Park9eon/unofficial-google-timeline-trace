import {setup} from 'xstate';

export type StudioWorkflowEvent =
  | {type: 'BOOT_SUCCESS'} | {type: 'BOOT_FAILURE'} | {type: 'BOOT_RETRY'}
  | {type: 'IMPORT_START'} | {type: 'IMPORT_SUCCESS'} | {type: 'IMPORT_FAILURE'} | {type: 'IMPORT_CANCEL'}
  | {type: 'MAP_LOADING'} | {type: 'MAP_READY'} | {type: 'MAP_FAILURE'} | {type: 'MAP_RETRY'}
  | {type: 'RENDER_START'} | {type: 'RENDER_SUCCESS'} | {type: 'RENDER_FAILURE'} | {type: 'RENDER_CANCEL'};

export const studioMachine = setup({types: {events: {} as StudioWorkflowEvent}}).createMachine({
  id: 'studio',
  type: 'parallel',
  states: {
    boot: {
      initial: 'loading',
      states: {
        loading: {on: {BOOT_SUCCESS: 'ready', BOOT_FAILURE: 'error'}},
        ready: {},
        error: {on: {BOOT_RETRY: 'loading', BOOT_SUCCESS: 'ready'}},
      },
    },
    source: {
      initial: 'idle',
      states: {
        idle: {on: {IMPORT_START: 'importing'}},
        importing: {on: {IMPORT_SUCCESS: 'idle', IMPORT_FAILURE: 'error', IMPORT_CANCEL: 'idle'}},
        error: {on: {IMPORT_START: 'importing', IMPORT_CANCEL: 'idle'}},
      },
    },
    map: {
      initial: 'idle',
      states: {
        idle: {on: {MAP_LOADING: 'loading'}},
        loading: {on: {MAP_READY: 'ready', MAP_FAILURE: 'error'}},
        ready: {on: {MAP_LOADING: 'loading', MAP_FAILURE: 'error'}},
        error: {on: {MAP_RETRY: 'loading', MAP_LOADING: 'loading', MAP_READY: 'ready'}},
      },
    },
    render: {
      initial: 'idle',
      states: {
        idle: {on: {RENDER_START: 'rendering'}},
        rendering: {on: {RENDER_SUCCESS: 'complete', RENDER_FAILURE: 'error', RENDER_CANCEL: 'idle'}},
        complete: {on: {RENDER_START: 'rendering'}},
        error: {on: {RENDER_START: 'rendering', RENDER_CANCEL: 'idle'}},
      },
    },
  },
});
