'use client';

import {useSyncExternalStore} from 'react';

export type MapRuntimeStatus = 'idle' | 'loading' | 'ready' | 'reload-required' | 'error';
export type MapRuntimeState = {
  status: MapRuntimeStatus;
  revision: number;
  message: string;
};

let state: MapRuntimeState = {status: 'idle', revision: 0, message: ''};
const listeners = new Set<() => void>();

export const publishMapRuntimeState = (status: MapRuntimeStatus, message: string) => {
  state = {status, message, revision: state.revision + 1};
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;
const serverSnapshot: MapRuntimeState = {status: 'idle', revision: 0, message: ''};

export const useMapRuntimeState = () => useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
