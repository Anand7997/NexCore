import React, { useEffect, useMemo, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Target,
  Code,
  Play,
  BarChart3,
  Settings,
  Database,
  TestTube,
  FolderOpen,
  Activity,
  TrendingUp,
  FileText,
  Clock,
  Users,
  Shield,
  Zap,
  Monitor,
  Bug,
  RefreshCw,
  List,
  History,
  BarChart,
  Home,
  Search,
  LayoutDashboard,
  Moon,
  Sun,
  UserCircle2,
  GitBranch,
  ServerCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const automationSections = [
  {
    id: 'requirements',
    title: 'Requirement and Feasibility Analysis',
    shortTitle: 'Requirements & Feasibility',
    group: 'Dashboard Types',
    icon: FileSearch,
    railIcon: LayoutDashboard,
    isPlaceholder: false,
    quickActions: [
      { id: 'upload-document', title: 'Upload Document', icon: Upload },
      { id: 'test-analysis', title: 'Test Analysis', icon: TestTube },
    ],
  },
  {
    id: 'authentication',
    title: 'Authentication',
    shortTitle: 'Authentication',
    group: 'Dashboard Types',
    icon: Shield,
    railIcon: Shield,
    isPlaceholder: false,
    quickActions: [
      { id: 'authorize-users', title: 'Authorize Users', icon: Users },
      { id: 'authorize-functions', title: 'Authorize Functions', icon: Settings },
    ],
  },
  {
    id: 'planning',
    title: 'Automation Planning',
    shortTitle: 'Automation Planning',
    group: 'Dashboard Types',
    icon: Target,
    railIcon: Database,
    isPlaceholder: false,
    quickActions: [
      { id: 'projects', title: 'Projects', icon: Database },
      { id: 'modules', title: 'Modules', icon: TestTube },
      { id: 'test-cases', title: 'Test Cases', icon: FileText },
      { id: 'test-steps', title: 'Test Steps', icon: List },
    ],
  },
  {
    id: 'development',
    title: 'Automation Development',
    shortTitle: 'Automation Development',
    group: 'Dashboard Types',
    icon: Code,
    railIcon: Code,
    isPlaceholder: false,
    quickActions: [
      { id: 'dev-projects', title: 'Projects', icon: Database },
      { id: 'dev-modules', title: 'Modules', icon: TestTube },
      { id: 'dev-test-cases', title: 'Test Cases', icon: FileText },
      { id: 'dev-test-steps', title: 'Test Steps', icon: List },
    ],
  },
  {
    id: 'execution',
    title: 'Test Lab',
    shortTitle: 'Test Lab',
    group: 'Report Summaries',
    icon: Play,
    railIcon: Play,
    isPlaceholder: false,
    quickActions: [
      { id: 'test-suite', title: 'Test Suite', icon: TestTube },
      { id: 'run-execution', title: 'Execute Tests', icon: Monitor },
    ],
  },
  {
    id: 'reporting',
    title: 'Reporting',
    shortTitle: 'Reporting',
    group: 'Report Summaries',
    icon: BarChart3,
    railIcon: BarChart,
    isPlaceholder: false,
    quickActions: [
      { id: 'execution-history', title: 'Execution History', icon: History },
      { id: 'custom-dashboard', title: 'Overall Reports', icon: LayoutDashboard },
      { id: 'allure-reports', title: 'Allure Reports', icon: FileText },
      { id: 'extent-reports', title: 'Extent Reports', icon: FileSearch },
      { id: 'analytics', title: 'Analytics', icon: TrendingUp },
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    shortTitle: 'Maintenance',
    group: 'Business Intelligence',
    icon: Settings,
    railIcon: Settings,
    isPlaceholder: false,
    quickActions: [
      { id: 'system-health', title: 'System Health', icon: Activity },
      { id: 'asset-management', title: 'Asset Management', icon: FolderOpen },
      { id: 'optimization', title: 'Optimization', icon: Zap },
      { id: 'scheduling', title: 'Maintenance Scheduling', icon: Clock },
      { id: 'security', title: 'Security & Compliance', icon: Shield },
      { id: 'troubleshooting', title: 'Diagnostics', icon: Bug },
      { id: 'cleanup', title: 'Cleanup Tools', icon: RefreshCw },
    ],
  },
  {
    id: 'cicd',
    title: 'CI-CD Pipeline',
    shortTitle: 'CI-CD Pipeline',
    group: 'DevOps',
    icon: ServerCog,
    railIcon: ServerCog,
    isPlaceholder: false,
    quickActions: [
      { id: 'jenkins-pipeline', title: 'Jenkins Pipeline', icon: ServerCog },
      { id: 'git-pipeline', title: 'Git Pipeline', icon: GitBranch },
    ],
  },
];

interface NavigationFlow {
  currentStep: number;
  sectionId: string;
  steps: string[];
}

interface ProfessionalSidebarProps {
  onSectionAction?: (sectionId: string, actionId: string) => void;
  onQuickAction?: (actionId: string) => void;
  navigationFlow?: NavigationFlow;
  onSectionSelect?: (sectionId: string) => void;
  onHomeClick?: () => void;
}

export function ProfessionalSidebar({
  onSectionAction,
  onQuickAction,
  navigationFlow,
  onSectionSelect,
  onHomeClick,
}: ProfessionalSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [activeSections, setActiveSections] = useState<string[]>([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('qfast-theme');
    const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const nextTheme = prev === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      localStorage.setItem('qfast-theme', nextTheme);
      return nextTheme;
    });
  };

  const groupedSections = useMemo(() => {
    const filteredSections = automationSections.filter((section) => {
      if (!searchQuery.trim()) {
        return true;
      }

      const query = searchQuery.toLowerCase();
      return (
        section.shortTitle.toLowerCase().includes(query) ||
        section.quickActions.some((action) => action.title.toLowerCase().includes(query))
      );
    });

    return filteredSections.reduce<Record<string, typeof automationSections>>((acc, section) => {
      if (!acc[section.group]) {
        acc[section.group] = [];
      }
      acc[section.group].push(section);
      return acc;
    }, {});
  }, [searchQuery]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  const handleSectionClick = (sectionId: string) => {
    setActiveSections((prev) => (prev.includes(sectionId) ? prev : [sectionId]));
    onSectionSelect?.(sectionId);
  };

  const handleQuickActionClick = (sectionId: string, actionId: string) => {
    setActiveSections([sectionId]);
    onSectionAction?.(sectionId, actionId);
    onQuickAction?.(actionId);
  };

  const railItems = [
    ...automationSections.map((section) => ({
      id: section.id,
      icon: section.railIcon,
      onClick: () => {
        handleSectionClick(section.id);
        if (!isCollapsed) {
          setExpandedSections((prev) => (prev.includes(section.id) ? prev : [...prev, section.id]));
        }
      },
      active: activeSections.includes(section.id),
      label: section.shortTitle,
    })),
  ];

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      style={
        {
          '--sidebar-width': '24rem',
          '--sidebar-width-icon': '4.75rem',
        } as React.CSSProperties
      }
      className="border-r-0 p-0 [&_[data-sidebar=sidebar]]:overflow-hidden [&_[data-sidebar=sidebar]]:rounded-none [&_[data-sidebar=sidebar]]:bg-sidebar"
    >
      <div className="flex h-full w-full bg-sidebar text-sidebar-foreground">
        <div className="flex h-full w-[72px] flex-col items-center border-r border-sidebar-border bg-sidebar py-4">
          <button
            className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground transition hover:bg-sidebar-accent/80"
            onClick={() => onHomeClick?.()}
            title="Dashboard home"
          >
            <Home className="h-5 w-5" />
          </button>

          <div className="flex flex-1 flex-col items-center gap-3">
            {railItems.map((item) => (
              <button
                key={item.id}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/65 transition',
                  'hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  item.active && 'bg-sidebar-accent text-sidebar-foreground'
                )}
                onClick={item.onClick}
                title={item.label}
              >
                <item.icon className="h-4.5 w-4.5" />
              </button>
            ))}
          </div>

        <div className="flex flex-col items-center gap-3">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </button>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Settings"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-sidebar-foreground"
            onClick={() => {
              window.location.href = `${window.location.origin}/dashboard`;
            }}
            title="Profile"
            aria-label="Profile"
          >
            <UserCircle2 className="h-5 w-5" />
          </button>
        </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-1 bg-sidebar p-3">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-sidebar-border bg-sidebar shadow-[0_0_0_1px_hsl(var(--sidebar-border)/0.35)]">
              <SidebarHeader className="border-b border-sidebar-border bg-sidebar px-5 py-5">
                <div className="flex items-center justify-between">
                  <div />
                  <button
                    onClick={toggleSidebar}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    title="Collapse sidebar"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search tasks, projects..."
                    className="h-12 w-full rounded-xl border border-sidebar-border bg-sidebar-accent pl-11 pr-4 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45 focus:border-sidebar-ring"
                  />
                </div>
              </SidebarHeader>

              <SidebarContent className="space-y-8 overflow-y-auto bg-sidebar px-4 py-5">
                {Object.entries(groupedSections).map(([groupName, sections]) => (
                  <div key={groupName}>
                    <div className="px-3 text-sm font-medium text-sidebar-foreground/55">{groupName}</div>

                    <div className="mt-3 space-y-1.5">
                      {sections.map((section) => {
                        const isExpanded = expandedSections.includes(section.id);
                        const isActive = activeSections.includes(section.id);

                        return (
                          <div key={section.id}>
                            <button
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition',
                                isActive
                                  ? 'bg-sidebar-accent text-sidebar-foreground'
                                  : 'text-sidebar-foreground/90 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                              )}
                              onClick={() => {
                                if (!section.isPlaceholder) {
                                  handleSectionClick(section.id);
                                  toggleSection(section.id);
                                }
                              }}
                              disabled={section.isPlaceholder}
                            >
                              <div
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-lg',
                                  isActive ? 'bg-sidebar-background text-sidebar-foreground' : 'bg-transparent text-sidebar-foreground/70'
                                )}
                              >
                                <section.icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1 pr-2 text-[1rem] font-semibold leading-5">
                                {section.shortTitle}
                              </div>
                              {section.quickActions.length > 0 &&
                                (isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-sidebar-foreground/55" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-sidebar-foreground/55" />
                                ))}
                            </button>

                            {isExpanded && section.quickActions.length > 0 && (
                              <div className="ml-5 mt-1 space-y-1 border-l border-sidebar-border pl-4">
                                {section.quickActions.map((action, index) => {
                                  const isCurrentStep =
                                    navigationFlow &&
                                    navigationFlow.sectionId === section.id &&
                                    navigationFlow.currentStep === index;

                                  const isCompleted =
                                    navigationFlow &&
                                    navigationFlow.sectionId === section.id &&
                                    navigationFlow.currentStep > index;

                                  return (
                                    <button
                                      key={action.id}
                                      className={cn(
                                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                                        isCurrentStep
                                          ? 'bg-sidebar-accent text-sidebar-foreground'
                                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                                        isCompleted && 'text-sidebar-foreground/90'
                                      )}
                                      onClick={() => handleQuickActionClick(section.id, action.id)}
                                    >
                                      <div
                                        className={cn(
                                          'flex h-7 w-7 items-center justify-center rounded-md',
                                          isCurrentStep ? 'bg-sidebar-background' : 'bg-sidebar-background/70'
                                        )}
                                      >
                                        <action.icon className="h-3.5 w-3.5" />
                                      </div>
                                      <span className="truncate font-medium">{action.title}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {Object.keys(groupedSections).length === 0 && (
                  <div className="rounded-xl border border-sidebar-border bg-sidebar-accent px-4 py-5 text-sm text-sidebar-foreground/60">
                    No matching sections found.
                  </div>
                )}
              </SidebarContent>
            </div>
          </div>
        )}
      </div>

      {isCollapsed && (
        <button
          onClick={toggleSidebar}
          className="absolute left-[84px] top-6 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <SidebarRail className="hidden" />
    </Sidebar>
  );
}
