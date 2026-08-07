import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ClipboardList,
  Lightbulb,
  Code2,
  Play,
  BarChart3,
  Settings,
  ArrowRight,
  Target,
  AlertTriangle,
  Lock,
  ServerCog
} from 'lucide-react';

// Import existing components that will be used in each tab
import AutomationPlanningDashboard from './AutomationPlanningDashboard';
import AutomationDevelopmentDashboard from './AutomationDevelopmentDashboard';
import TestExecutionDashboard from './TestExecutionDashboard';
import ReportingDashboard from './ReportingDashboard';
import RequirementsAnalysisDashboard from './RequirementsAnalysisDashboard';
import AuthenticationDashboard from './AuthenticationDashboard';
import { MaintenanceDashboard } from './MaintenanceDashboard';
import CicdPipelineDashboard from './CicdPipelineDashboard';
import { useAuthorization } from '@/hooks/useAuthorization';


interface User {
  id: number;
  username: string;
  email: string;
  role?: string;
  status?: string;
  last_login: string;
}

interface MainDashboardProps {
  onFunctionSelect?: (func: any) => void;
}

type TabType = 'Home' | 'requirements' | 'authentication' | 'planning' | 'development' | 'execution' | 'reporting' | 'maintenance' | 'cicd';

const MainDashboard: React.FC<MainDashboardProps> = ({ onFunctionSelect }) => {
  const [activeTab, setActiveTab] = useState<TabType>('Home');
  const [navigationData, setNavigationData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Authorization checks for each function
  const requirementsAuth = useAuthorization('requirements');
  const authenticationAuth = useAuthorization('authentication');
  const planningAuth = useAuthorization('planning');
  const developmentAuth = useAuthorization('development');
  const testLabAuth = useAuthorization('test-lab');
  const reportingAuth = useAuthorization('reporting');
  const maintenanceAuth = useAuthorization('maintenance');

  // Load current user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('qfast_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (error) {
        console.error('Error parsing saved user:', error);
      }
    }
  }, []);

  // Listen for navigation events from development dashboard
  React.useEffect(() => {
    const handleNavigateToPlanning = (event: any) => {
      setActiveTab('planning');
      if (event.detail) {
        setNavigationData(event.detail);
      }
    };

    window.addEventListener('navigateToPlanning', handleNavigateToPlanning);
    return () => {
      window.removeEventListener('navigateToPlanning', handleNavigateToPlanning);
    };
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Home':
        return renderHomeContent();
      case 'requirements':
        if (!requirementsAuth.authorized && !requirementsAuth.loading) {
          return renderUnauthorizedContent('Requirements & Feasibility Analysis');
        }
        return renderRequirementsContent();
      case 'authentication':
        if (!authenticationAuth.authorized && !authenticationAuth.loading) {
          return renderUnauthorizedContent('Authentication');
        }
        return renderAuthenticationContent();
      case 'planning':
        if (!planningAuth.authorized && !planningAuth.loading) {
          return renderUnauthorizedContent('Automation Planning');
        }
        return <AutomationPlanningDashboard onBack={() => setActiveTab('Home')} navigationData={navigationData} />;
      case 'development':
        if (!developmentAuth.authorized && !developmentAuth.loading) {
          return renderUnauthorizedContent('Automation Development');
        }
        return <AutomationDevelopmentDashboard onBack={() => setActiveTab('Home')} />;
      case 'execution':
        if (!testLabAuth.authorized && !testLabAuth.loading) {
          return renderUnauthorizedContent('Test Lab');
        }
        return <TestExecutionDashboard />;
      case 'reporting':
        if (!reportingAuth.authorized && !reportingAuth.loading) {
          return renderUnauthorizedContent('Reporting');
        }
        return <ReportingDashboard />;
      case 'maintenance':
        if (!maintenanceAuth.authorized && !maintenanceAuth.loading) {
          return renderUnauthorizedContent('Maintenance');
        }
        return renderMaintenanceContent();
      case 'cicd':
        return <CicdPipelineDashboard onBack={() => setActiveTab('Home')} />;
      default:
        return renderHomeContent();
    }
  };

  const renderHomeContent = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Automation Pro Suite</h1>
        <p className="text-base md:text-lg text-muted-foreground">Comprehensive Test Automation Lifecycle Management</p>
      </div>

      {/* Main Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Requirements Card */}
        <Card
          className={`transition-all duration-200 border-l-4 border-l-blue-600 hover:border-blue-300 ${
            requirementsAuth.loading ? 'cursor-wait opacity-50' :
            !requirementsAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!requirementsAuth.loading && requirementsAuth.authorized) {
              setActiveTab('requirements');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Requirements & Feasibility Analysis</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Define requirements, assess feasibility, and validate automation scope
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Phase 1</Badge>
              <ArrowRight className="w-4 h-4 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`transition-all duration-200 border-l-4 border-l-violet-600 hover:border-violet-300 ${
            authenticationAuth.loading ? 'cursor-wait opacity-50' :
            !authenticationAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!authenticationAuth.loading && authenticationAuth.authorized) {
              setActiveTab('authentication');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-violet-500 rounded-lg flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Authentication</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Control user access and function-level authorization settings
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-violet-100 text-violet-800 border-violet-200">Security</Badge>
              <ArrowRight className="w-4 h-4 text-violet-500" />
            </div>
          </CardContent>
        </Card>

        {/* Planning Card */}
        <Card
          className={`transition-all duration-200 border-l-4 border-l-emerald-600 hover:border-emerald-300 ${
            planningAuth.loading ? 'cursor-wait opacity-50' :
            !planningAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!planningAuth.loading && planningAuth.authorized) {
              setActiveTab('planning');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                <Lightbulb className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Automation Planning</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Create projects, define modules, and organize test cases structure
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">Phase 2</Badge>
              <ArrowRight className="w-4 h-4 text-green-500" />
            </div>
          </CardContent>
        </Card>

        {/* Development Card */}
        <Card
          className={`transition-all duration-200 border-l-4 border-l-violet-600 hover:border-violet-300 ${
            developmentAuth.loading ? 'cursor-wait opacity-50' :
            !developmentAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!developmentAuth.loading && developmentAuth.authorized) {
              setActiveTab('development');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                <Code2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Automation Development</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Build test steps, create automation scripts, and develop test cases
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-violet-100 text-violet-800 border-violet-200">Phase 3</Badge>
              <ArrowRight className="w-4 h-4 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        {/* Execution Card */}
        <Card
          className={`transition-all duration-200 border-l-4 border-l-amber-600 hover:border-amber-300 ${
            testLabAuth.loading ? 'cursor-wait opacity-50' :
            !testLabAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!testLabAuth.loading && testLabAuth.authorized) {
              setActiveTab('execution');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Test Lab</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Execute test suites, run automation scripts, and monitor test runs
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">Phase 4</Badge>
              <ArrowRight className="w-4 h-4 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        {/* Reporting Card */}
        <Card
          className={`transition-all duration-200 border-l-4 border-l-cyan-600 hover:border-cyan-300 ${
            reportingAuth.loading ? 'cursor-wait opacity-50' :
            !reportingAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!reportingAuth.loading && reportingAuth.authorized) {
              setActiveTab('reporting');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-cyan-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Reporting</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              View execution results, generate reports, and analyze test outcomes
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 border-cyan-200">Phase 5</Badge>
              <ArrowRight className="w-4 h-4 text-cyan-600" />
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Card */}
        <Card
          className={`transition-all duration-200 border-l-4 border-l-slate-600 hover:border-slate-300 ${
            maintenanceAuth.loading ? 'cursor-wait opacity-50' :
            !maintenanceAuth.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-md'
          }`}
          onClick={() => {
            if (!maintenanceAuth.loading && maintenanceAuth.authorized) {
              setActiveTab('maintenance');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-500 rounded-lg flex items-center justify-center">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">Maintenance</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Update tests, maintain scripts, and manage automation framework
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-slate-100 text-slate-800 border-slate-200">Phase 6</Badge>
              <ArrowRight className="w-4 h-4 text-slate-600" />
            </div>
          </CardContent>
        </Card>

        {/* CI-CD Pipeline Card */}
        <Card
          className="cursor-pointer transition-all duration-200 border-l-4 border-l-teal-600 hover:border-teal-300 hover:shadow-md"
          onClick={() => setActiveTab('cicd')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center">
                <ServerCog className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">CI-CD Pipeline</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Trigger Jenkins builds and pass Git branch parameters from EC2
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-teal-100 text-teal-800 border-teal-200">DevOps</Badge>
              <ArrowRight className="w-4 h-4 text-teal-600" />
            </div>
          </CardContent>
        </Card>
      </div>



    </div>
  );

  const renderRequirementsContent = () => (
    <div className="space-y-6">
      <RequirementsAnalysisDashboard onBack={() => setActiveTab('Home')} onFunctionSelect={onFunctionSelect} />
    </div>
  );

  const renderAuthenticationContent = () => (
    <div className="space-y-6">
      <AuthenticationDashboard onBack={() => setActiveTab('Home')} onFunctionSelect={onFunctionSelect} />
    </div>
  );

  const renderMaintenanceContent = () => (
    <div className="space-y-6">
      <MaintenanceDashboard />
    </div>
  );

  const renderUnauthorizedContent = (functionName: string) => (
    <div className="space-y-6">
      <Card className="bg-card border-red-200">
        <CardHeader>
          <CardTitle className="text-2xl text-red-900 flex items-center">
            <AlertTriangle className="w-6 h-6 mr-2" />
            Access Denied
          </CardTitle>
          <p className="text-red-700">You do not have permission to access this function</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You are not authorized to access the <strong>{functionName}</strong> function.
              Please contact your administrator to request access.
            </AlertDescription>
          </Alert>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Only users assigned to this function by an administrator can access it.
            </p>
            <Button
              onClick={() => setActiveTab('Home')}
              variant="secondary"
            >
              Back to Home
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen app-shell">
      <div className="container mx-auto px-6 py-8">
        {/* Top Navigation Tabs */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 bg-card p-2 rounded-lg shadow-sm border border-border">
            {[
              { key: 'Home', label: 'Home', icon: Target },
              { key: 'requirements', label: 'Requirements & Feasibility', icon: ClipboardList },
              { key: 'authentication', label: 'Authentication', icon: Lock },
              { key: 'planning', label: 'Automation Planning', icon: Lightbulb },
              { key: 'development', label: 'Automation Development', icon: Code2 },
              { key: 'execution', label: 'Test Execution', icon: Play },
              { key: 'reporting', label: 'Reporting', icon: BarChart3 },
              { key: 'maintenance', label: 'Maintenance', icon: Settings },
              { key: 'cicd', label: 'CI-CD Pipeline', icon: ServerCog }
            ].map(({ key, label, icon: Icon }) => {
              // Check authorization for each tab
              let isAuthorized = true;
              let isLoading = false;

              if (key === 'requirements') {
                isAuthorized = requirementsAuth.authorized;
                isLoading = requirementsAuth.loading;
              } else if (key === 'authentication') {
                isAuthorized = authenticationAuth.authorized;
                isLoading = authenticationAuth.loading;
              } else if (key === 'planning') {
                isAuthorized = planningAuth.authorized;
                isLoading = planningAuth.loading;
              } else if (key === 'development') {
                isAuthorized = developmentAuth.authorized;
                isLoading = developmentAuth.loading;
              } else if (key === 'execution') {
                isAuthorized = testLabAuth.authorized;
                isLoading = testLabAuth.loading;
              } else if (key === 'reporting') {
                isAuthorized = reportingAuth.authorized;
                isLoading = reportingAuth.loading;
              } else if (key === 'maintenance') {
                isAuthorized = maintenanceAuth.authorized;
                isLoading = maintenanceAuth.loading;
              }

              return (
                <Button
                  key={key}
                  variant={activeTab === key ? 'default' : 'ghost'}
                  onClick={() => {
                    if (!isLoading && isAuthorized) {
                      setActiveTab(key as TabType);
                    }
                  }}
                  disabled={isLoading || !isAuthorized}
                  className={`flex items-center space-x-2 text-sm ${
                    activeTab === key
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : isLoading
                        ? 'text-muted-foreground cursor-wait'
                        : !isAuthorized
                          ? 'text-red-400 cursor-not-allowed'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                  {!isAuthorized && !isLoading && <Lock className="w-3.5 h-3.5" />}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="w-full">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;
