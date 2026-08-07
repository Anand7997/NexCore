import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FolderPlus, Lightbulb, Target, AlertTriangle, RefreshCw, Layers, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/useAuthorization';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';
import PhaseStepCard from '@/components/ui/phase-step-card';

// Import existing components
import ProjectDashboard from './ProjectDashboard';
import ModulesDashboard from './ModulesDashboard';
import TestCaseDashboard from './TestCaseDashboard';

type PlanningViewType = 'overview' | 'projects' | 'modules' | 'testcases';

interface AutomationPlanningDashboardProps {
  onBack?: () => void;
  navigationData?: {
    navigateToTestCases?: boolean;
    projectId?: number;
    moduleId?: number;
    savedTestCase?: string;
    message?: string;
  };
}

const AutomationPlanningDashboard: React.FC<AutomationPlanningDashboardProps> = ({ onBack, navigationData }) => {
  const [currentView, setCurrentView] = useState<PlanningViewType>('overview');
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedModule, setSelectedModule] = useState<any>(null);

  // Check authorization for planning function
  const { authorized, loading: authLoading, error: authError } = useAuthorization('planning');

  const { toast } = useToast();

  // Handle navigation from development dashboard
  React.useEffect(() => {
    if (navigationData?.navigateToTestCases && navigationData.projectId && navigationData.moduleId) {
      // Auto-navigate to test cases view
      // First, we need to fetch the project and module data
      fetchProjectAndModule(navigationData.projectId, navigationData.moduleId);
    }
  }, [navigationData]);

  const fetchProjectAndModule = async (projectId: number, moduleId: number) => {
    try {
      // Fetch project data
      const projectResponse = await fetch(buildApiUrl(`/api/projects/${projectId}`));
      if (projectResponse.ok) {
        const project = await projectResponse.json();
        setSelectedProject(project);
        
        // Fetch module data
        const moduleResponse = await fetch(buildApiUrl(`/api/modules/${moduleId}`));
        if (moduleResponse.ok) {
          const module = await moduleResponse.json();
          setSelectedModule(module);
          setCurrentView('testcases');
          
          // Show success message for sync from development
          if (navigationData?.message) {
            setTimeout(() => {
              toast({
                title: "🎯 Automation Planning Sync Complete",
                description: navigationData.message,
              });
            }, 500);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching project/module data:', error);
      // Fallback to overview if fetch fails
      setCurrentView('overview');
    }
  };

  const handleProjectSelect = (project: any) => {
    setSelectedProject(project);
    setCurrentView('modules');
  };

  const handleModuleSelect = (module: any) => {
    setSelectedModule(module);
    setCurrentView('testcases');
  };

  const renderBreadcrumb = () => {
    const items = [];
    
    items.push({ label: 'Automation Planning', onClick: () => setCurrentView('overview') });
    
    if (currentView === 'projects' || selectedProject) {
      items.push({ label: 'Projects', onClick: () => setCurrentView('projects') });
    }
    
    if (selectedProject && (currentView === 'modules' || selectedModule)) {
      items.push({ 
        label: selectedProject.project_name || selectedProject.name, 
        onClick: () => setCurrentView('modules') 
      });
    }
    
    if (selectedModule && currentView === 'testcases') {
      items.push({ 
        label: selectedModule.name, 
        onClick: () => setCurrentView('testcases') 
      });
    }

    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600 mb-6">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <button
              onClick={item.onClick}
              className="hover:text-blue-600 hover:underline"
            >
              {item.label}
            </button>
            {index < items.length - 1 && <span>/</span>}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderOverview = () => (
    <div className="automation-planning-theme space-y-6">
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <Lightbulb className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl text-gray-900">Automation Planning</CardTitle>
              <p className="text-gray-600">Organize your automation projects, modules, and test cases</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Projects - Step 1 */}
            <PhaseStepCard
              icon={FolderPlus}
              title="Projects"
              description="Create and manage automation projects. Organize your test automation efforts by project."
              step="Step 1"
              accent="blue"
              onClick={() => setCurrentView('projects')}
            />

            {/* Modules - Step 2 */}
            <PhaseStepCard
              icon={Layers}
              title="Modules"
              description="Organize test cases into logical modules within projects for better structure."
              step="Step 2"
              accent="emerald"
              disabled={!selectedProject}
              disabledHint="Select a project first"
              onClick={() => setCurrentView('modules')}
            />

            {/* Test Cases - Step 3 */}
            <PhaseStepCard
              icon={FileText}
              title="Test Cases"
              description="View and manage test cases created by the Automation Development phase."
              step="Step 3"
              accent="violet"
              disabled={!selectedModule}
              disabledHint="Select a module first"
              onClick={() => setCurrentView('testcases')}
            />
          </div>


        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return renderOverview();
      case 'projects':
        return (
          <div className="space-y-4">
            <ProjectDashboard 
              onProjectSelect={handleProjectSelect}
              onBack={() => setCurrentView('overview')}
              showBackButton={true}
            />
          </div>
        );
      case 'modules':
        return (
          <div className="space-y-4">
            <ModulesDashboard 
              selectedProject={selectedProject}
              onModuleSelect={handleModuleSelect}
              onBack={() => setCurrentView('projects')}
            />
          </div>
        );
      case 'testcases':
        return (
          <div className="space-y-4">
            <TestCaseDashboard 
              selectedProject={selectedProject}
              selectedModule={selectedModule}
              onBack={() => setCurrentView('modules')}
              readOnlyMode={true} // This makes it show test cases created by development
              highlightTestCase={navigationData?.savedTestCase} // Highlight newly synced test case
              onTestCaseSelect={(testCase) => {
                // Handle test case selection to show test steps
                console.log('Selected test case:', testCase);
              }}
            />
          </div>
        );
      default:
        return renderOverview();
    }
  };

  // Show loading while checking authorization
  if (authLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Checking authorization...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error if authorization check failed
  if (authError) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">Error checking authorization: {authError}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show access denied if not authorized
  if (!authorized) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You are not allowed to access this function.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Home" />

      {/* Header */}
      <div className="flex items-center justify-between">
        {renderBreadcrumb()}
        <div />
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  );
};

export default AutomationPlanningDashboard;

