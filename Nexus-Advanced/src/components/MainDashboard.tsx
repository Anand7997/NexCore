'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Code2,
  Globe,
  Layers3,
  Lightbulb,
  Monitor,
  Play,
  Server,
  ServerCog,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface AutomationBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
}

export type PhaseId = 'requirements' | 'planning' | 'development' | 'execution' | 'reporting' | 'cicd' | 'ai-workflow';

export interface PhaseBlock {
  id: PhaseId;
  title: string;
  phase: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const automations: AutomationBlock[] = [
  {
    id: 'web',
    title: 'Web Automation',
    description: 'Browser pages, UI flows, locators, test cases, and execution.',
    icon: Globe,
    glow: '#60a5fa',
  },
  {
    id: 'desktop',
    title: 'Desktop Automation',
    description: 'Native desktop workflows, modules, screens, and execution.',
    icon: Monitor,
    glow: '#94a3b8',
  },
  {
    id: 'api',
    title: 'API Automation',
    description: 'Services, endpoints, validations, payload cases, and runs.',
    icon: Server,
    glow: '#fbbf24',
  },
  {
    id: 'mobile',
    title: 'Mobile Automation',
    description: 'Android and iOS pages, gestures, cases, and device runs.',
    icon: Smartphone,
    glow: '#34d399',
  },
  {
    id: 'unified',
    title: 'Unified Automation',
    description: 'Web, Desktop, Mobile, and API workflows in one suite.',
    icon: Layers3,
    glow: '#a78bfa',
  },
];

export const phases: PhaseBlock[] = [
  {
    id: 'requirements',
    title: 'Requirements & Feasibility Analysis',
    phase: 'Phase 1',
    description: 'Define requirements, assess feasibility, and validate automation scope',
    icon: ClipboardList,
    color: '#2563eb',
  },
  {
    id: 'planning',
    title: 'Automation Planning',
    phase: 'Phase 2',
    description: 'Create projects, define modules, and organize test cases structure',
    icon: Lightbulb,
    color: '#16a34a',
  },
  {
    id: 'development',
    title: 'Automation Development',
    phase: 'Phase 3',
    description: 'Build test steps, create automation scripts, and develop test cases',
    icon: Code2,
    color: '#8b5cf6',
  },
  {
    id: 'execution',
    title: 'Test Lab',
    phase: 'Phase 4',
    description: 'Execute test suites, run automation scripts, and monitor test runs',
    icon: Play,
    color: '#f97316',
  },
  {
    id: 'reporting',
    title: 'Reporting',
    phase: 'Phase 5',
    description: 'View execution results, generate reports, and analyze test outcomes',
    icon: BarChart3,
    color: '#0891b2',
  },
  {
    id: 'cicd',
    title: 'CI-CD Pipeline',
    phase: 'DevOps',
    description: 'Trigger Jenkins builds and pass Git branch parameters from EC2',
    icon: ServerCog,
    color: '#0d9488',
  },
  {
    id: 'ai-workflow',
    title: 'AI Workflow',
    phase: 'AI',
    description: 'Generate scenarios, test cases, and executable steps from a BRD with AI',
    icon: Sparkles,
    color: '#8b5cf6',
  },
];

export function MainDashboard() {
  return (
    <main className="flex min-h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-7">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-default)] md:text-4xl">
            MainDashboard
          </h1>
          <p className="text-base text-[var(--color-fg-muted)] md:text-lg">
            Platform automation surfaces extracted from the modern UI.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {automations.map((automation, index) => {
            const AutomationIcon = automation.icon;

            return (
              <Link className="block" key={automation.id} href={`/main-dashboard/automation/${automation.id}`}>
                <div
                  className="group relative h-full min-h-[158px] overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: 'var(--color-surface-1)',
                    borderColor: `${automation.glow}33`,
                    boxShadow: `0 0 0 1px ${automation.glow}18, 0 20px 60px ${automation.glow}12`,
                    animationDelay: `${index * 40}ms`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${automation.glow}1f` }}
                    >
                      <AutomationIcon className="h-6 w-6" style={{ color: automation.glow }} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-[var(--color-fg-default)]">
                        {automation.title}
                      </h2>
                      <p className="mt-1 text-sm leading-5 text-[var(--color-fg-muted)]">
                        {automation.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span
                      className="rounded-full px-2 py-1 font-mono text-[11px]"
                      style={{ backgroundColor: `${automation.glow}1a`, color: automation.glow }}
                    >
                      Open phases
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export function AutomationPhasesDashboard({ automationId }: { automationId: string }) {
  const automation = automations.find((item) => item.id === automationId);

  if (!automation) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <div className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-6 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">Automation block not found.</p>
          <Link href="/main-dashboard" className="mt-3 inline-flex text-sm font-semibold text-[var(--color-accent-default)]">
            Back to MainDashboard
          </Link>
        </div>
      </main>
    );
  }

  const AutomationIcon = automation.icon;

  return (
    <main className="flex min-h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-7">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]" href="/main-dashboard">
          <ArrowRight className="h-4 w-4 rotate-180" />
          MainDashboard
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: automation.glow }}>
            <AutomationIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-default)] md:text-4xl">{automation.title}</h1>
            <p className="text-base text-[var(--color-fg-muted)] md:text-lg">{automation.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {phases.map((phase) => {
            const PhaseIcon = phase.icon;

            return (
              <Link
                key={phase.id}
                href={
                  phase.id === 'development'
                    ? `/test-configuration?automation_space=${encodeURIComponent(automation.id)}`
                    : `/main-dashboard/automation/${automation.id}/${phase.id}`
                }
                className="block text-left"
              >
                <div
                  className="h-full rounded-xl border-l-4 bg-[var(--color-surface-1)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: `var(--color-line-default) var(--color-line-default) var(--color-line-default) ${phase.color}` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: phase.color }}>
                      <PhaseIcon className="h-6 w-6 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--color-fg-default)]">{phase.title}</h2>
                  </div>
                  <p className="mb-4 mt-4 text-sm text-[var(--color-fg-muted)]">{phase.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ backgroundColor: `${phase.color}1a`, color: phase.color }}>
                      {phase.phase}
                    </span>
                    <ArrowRight className="h-4 w-4" style={{ color: phase.color }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
