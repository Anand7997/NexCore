'use client';
import { create } from 'zustand';
import type { AppNotification } from '@/types';

/**
 * Workspace modes — applied to pages that have an "execution surface" (i.e.
 * Workflows / Executions / AI Analysis / Matrix). Pages that aren't part of a
 * workspace (Settings, Reports) ignore this.
 *
 *  - build       — author workflows on the canvas
 *  - run         — watch an execution live
 *  - investigate — debug a failure with AI + evidence
 *  - matrix      — cross-platform parity overview
 */
export type WorkspaceMode = 'build' | 'run' | 'investigate' | 'matrix';
export type AppTheme = 'dark' | 'light';

interface UIStore {
  // Layout
  sidebarCollapsed: boolean;
  terminalOpen: boolean;
  terminalHeight: number;
  inspectorOpen: boolean;
  inspectorExecutionId: string | null;

  // Theme
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  toggleTheme: () => void;

  // Workspace
  activeSection: string;
  workspaceMode: WorkspaceMode;

  // Command palette
  commandPaletteOpen: boolean;

  // Builder-specific (canvas mode)
  paletteOpen: boolean;
  nodeInspectorOpen: boolean;
  selectedNodeKey: string | null;

  // Notifications
  notifications: AppNotification[];

  // Setters
  setSidebarCollapsed:   (v: boolean) => void;
  toggleSidebar:         () => void;
  setTerminalOpen:       (v: boolean) => void;
  toggleTerminal:        () => void;
  setTerminalHeight:     (h: number) => void;
  toggleInspector:       () => void;
  openInspectorFor:      (executionId: string) => void;
  closeInspector:        () => void;
  setActiveSection:      (s: string) => void;
  setWorkspaceMode:      (m: WorkspaceMode) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  toggleCommandPalette:  () => void;
  setPaletteOpen:        (v: boolean) => void;
  togglePalette:         () => void;
  setNodeInspectorOpen:  (v: boolean) => void;
  selectNode:            (key: string | null) => void;
  addNotification:       (n: Omit<AppNotification, 'id' | 'timestamp'>) => void;
  dismissNotification:   (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  theme: 'dark',
  setTheme:      (theme) => set({ theme }),
  toggleTheme:   () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  // Defaults — start CLOSED. Progressive disclosure means the user opens
  // surfaces when they want them, not the other way around.
  sidebarCollapsed:     false,
  terminalOpen:         false,
  terminalHeight:       280,
  inspectorOpen:        false,
  inspectorExecutionId: null,

  activeSection:  'dashboard',
  workspaceMode:  'build',

  commandPaletteOpen:  false,

  paletteOpen:         false,
  nodeInspectorOpen:   false,
  selectedNodeKey:     null,

  notifications: [],

  setSidebarCollapsed:   (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar:         () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTerminalOpen:       (terminalOpen) => set({ terminalOpen }),
  toggleTerminal:        () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalHeight:     (terminalHeight) => set({ terminalHeight }),
  toggleInspector:       () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  openInspectorFor:      (executionId) =>
    set({ inspectorOpen: true, inspectorExecutionId: executionId, workspaceMode: 'investigate' }),
  closeInspector:        () => set({ inspectorOpen: false, inspectorExecutionId: null }),
  setActiveSection:      (activeSection) => set({ activeSection }),
  setWorkspaceMode:      (workspaceMode) => set({ workspaceMode }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette:  () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setPaletteOpen:        (paletteOpen) => set({ paletteOpen }),
  togglePalette:         () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setNodeInspectorOpen:  (nodeInspectorOpen) => set({ nodeInspectorOpen }),
  selectNode:            (selectedNodeKey) =>
    set({ selectedNodeKey, nodeInspectorOpen: selectedNodeKey != null }),

  addNotification: (n) => set((s) => ({
    notifications: [
      { ...n, id: `notif-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, timestamp: new Date().toISOString() },
      ...s.notifications,
    ].slice(0, 6),
  })),
  dismissNotification: (id) => set((s) => ({
    notifications: s.notifications.filter((n) => n.id !== id),
  })),
}));
