'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

interface RouteMeta {
  label: string;
  group: 'OPS' | 'DESIGN' | 'SYS' | 'ROOT';
  subtitle?: string;
}

const ROUTE_META: Record<string, RouteMeta> = {
  '/':                   { label: 'Command Center',      group: 'ROOT', subtitle: 'NEXCORE.OPS · V2.0 · DASHBOARD' },
  '/workspace':          { label: 'Workspace',           group: 'OPS' },
  '/workspace/new':      { label: 'Create Workspace',    group: 'OPS' },
  '/executions':         { label: 'Executions',          group: 'OPS' },
  '/execution-control':  { label: 'Execution Control',   group: 'OPS' },
  '/workflows':          { label: 'Workflows',           group: 'OPS' },
  '/ai-workflow':        { label: 'AI Workflow',         group: 'OPS', subtitle: '▸ DISCOVERY · PLAN · HEAL · v1' },
  '/agents':             { label: 'Agents',              group: 'OPS' },

  '/test-designer':      { label: 'Test Designer',       group: 'DESIGN' },
  '/test-configuration': { label: 'Test Configuration',  group: 'DESIGN' },
  '/testcases':          { label: 'Test Cases',          group: 'DESIGN' },
  '/page-repository':    { label: 'Page Repository',     group: 'DESIGN' },
  '/intent-studio':      { label: 'Intent Studio',       group: 'DESIGN' },
  '/architecture':       { label: 'Architecture',        group: 'DESIGN' },

  '/ai-analysis':        { label: 'AI Analysis',         group: 'SYS' },
  '/ai-investigation':   { label: 'AI Investigation',    group: 'SYS' },
  '/knowledge-graph':    { label: 'Knowledge Graph',     group: 'SYS' },
  '/matrix':             { label: 'Platform Matrix',     group: 'SYS' },
  '/reports':            { label: 'Reports',             group: 'SYS' },
  '/settings':           { label: 'Settings',            group: 'SYS' },
  '/demo':               { label: 'Demo',                group: 'SYS' },
};

export function useShellContext() {
  const pathname = usePathname();
  return useMemo(() => {
    const exact = ROUTE_META[pathname];
    if (exact) return { pathname, ...exact };
    const match = Object.entries(ROUTE_META).find(
      ([href]) => href !== '/' && pathname.startsWith(href),
    );
    return { pathname, ...(match?.[1] ?? ROUTE_META['/']) };
  }, [pathname]);
}
