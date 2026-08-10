import { useSyncExternalStore } from 'react';

export type AppTheme = 'dark' | 'light';

type UIState = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

const listeners = new Set<() => void>();

const state: UIState = {
  theme: 'dark',
  setTheme(theme) {
    state.theme = theme;
    listeners.forEach((listener) => listener());
  },
  toggleTheme() {
    state.setTheme(state.theme === 'dark' ? 'light' : 'dark');
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useUIStore<T>(selector: (store: UIState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}
