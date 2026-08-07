import React, { useState } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { ProfessionalSidebar } from '@/components/ProfessionalSidebar';
import MainDashboard from '@/components/MainDashboard';
import RecentResults from '@/components/RecentResults';
import PerformanceDashboard from '@/components/PerformanceDashboard';
import ProjectDashboard from '@/components/ProjectDashboard';
import ModulesDashboard from '@/components/ModulesDashboard';
import TestSuiteDashboard from '@/components/TestSuiteDashboard';
import { TestSuite } from '@/components/TestSuite';
import TestCaseDashboard from '@/components/TestCaseDashboard';
import TestExecutionDashboard from '@/components/TestExecutionDashboard';
import ReportingDashboard from '@/components/ReportingDashboard';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import AutomationPlanningDashboard from '@/components/AutomationPlanningDashboard';
import AutomationDevelopmentDashboard from '@/components/AutomationDevelopmentDashboard';
import RequirementsAnalysisDashboard from '@/components/RequirementsAnalysisDashboard';
import AuthenticationDashboard from '@/components/AuthenticationDashboard';
import CicdPipelineDashboard from '@/components/CicdPipelineDashboard';
import { UserManagement } from '@/components/UserManagement';
import { Database, Sparkles, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { useAuthorization } from '@/hooks/useAuthorization';
import LogoImage from '@/Logo.png';
 
const Index = () => {
  const [currentView, setCurrentView] = useState('main');
  const [currentSection, setCurrentSection] = useState('');
  const [navigationFlow, setNavigationFlow] = useState({
    currentStep: 0,
    sectionId: '',
    steps: ['projects', 'modules', 'test-cases', 'test-steps']
  });
 
  // Initial subview for Automation Development dashboard (for sidebar quick actions)
  const [devInitialView, setDevInitialView] = useState<'overview' | 'projects' | 'modules' | 'testcases' | 'steps'>('overview');
 
  // State for selected items across different views
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedTestSuite, setSelectedTestSuite] = useState(null);
  const [selectedTestCase, setSelectedTestCase] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [requirementsInitialPage, setRequirementsInitialPage] = useState<'blocks' | 'brd-upload' | 'brd-upload-document' | 'test-analysis'>('blocks');
  const [authenticationInitialPage, setAuthenticationInitialPage] = useState<'blocks' | 'authorize-users' | 'authorize-functions'>('blocks');
  const [cicdInitialTab, setCicdInitialTab] = useState<'jenkins' | 'git'>('jenkins');
 
  const { toast } = useToast();
 
  // Authorization checks for different functions
  const requirementsAuth = useAuthorization('requirements');
  const authenticationAuth = useAuthorization('authentication');
  const planningAuth = useAuthorization('planning');
  const developmentAuth = useAuthorization('development');
  const testLabAuth = useAuthorization('test-lab');
  const reportingAuth = useAuthorization('reporting');
 
  const handleSectionAction = (sectionId: string, actionId: string) => {
    console.log(`Section: ${sectionId}, Action: ${actionId}`);
    setCurrentSection(sectionId);
 
    // Check authorization for different sections
    if (sectionId === 'requirements' && !requirementsAuth.authorized && !requirementsAuth.loading) {
      toast({
        title: "Access Denied",
        description: "You are not authorized to access Requirements & Feasibility Analysis. Please contact your administrator.",
        variant: "destructive"
      });
      return;
    }

    if (sectionId === 'authentication' && !authenticationAuth.authorized && !authenticationAuth.loading) {
      toast({
        title: "Access Denied",
        description: "You are not authorized to access Authentication. Please contact your administrator.",
        variant: "destructive"
      });
      return;
    }
 
    if (sectionId === 'planning' && !planningAuth.authorized && !planningAuth.loading) {
      toast({
        title: "Access Denied",
        description: "You are not authorized to access Automation Planning. Please contact your administrator.",
        variant: "destructive"
      });
      return;
    }
 
    if (sectionId === 'development' && !developmentAuth.authorized && !developmentAuth.loading) {
      toast({
        title: "Access Denied",
        description: "You are not authorized to access Automation Development. Please contact your administrator.",
        variant: "destructive"
      });
      return;
    }
 
    // Handle navigation flow for planning and development sections
    if (sectionId === 'planning' || sectionId === 'development') {
      const flowSteps = ['projects', 'modules', 'test-cases', 'test-steps'];
      const devFlowSteps = ['dev-projects', 'dev-modules', 'dev-test-cases', 'dev-test-steps'];
 
      let currentStepIndex = 0;
      let targetView = '';
 
      // Determine current step and target view
      if (sectionId === 'planning') {
        currentStepIndex = flowSteps.indexOf(actionId);
        switch (actionId) {
          case 'projects':
            targetView = 'projects';
            break;
          case 'modules':
            targetView = 'modules';
            break;
          case 'test-cases':
            targetView = 'test-cases';
            break;
          case 'test-steps':
            targetView = 'test-cases'; // Test steps are part of test cases view
            break;
        }
      } else if (sectionId === 'development') {
        currentStepIndex = devFlowSteps.indexOf(actionId);
        // Map dev actions to AutomationDevelopmentDashboard subviews
        if (actionId === 'dev-projects') setDevInitialView('projects');
        else if (actionId === 'dev-modules') setDevInitialView('modules');
        else if (actionId === 'dev-test-cases') setDevInitialView('testcases');
        else if (actionId === 'dev-test-steps') setDevInitialView('steps');
        targetView = 'automation-development';
      }
 
      if (currentStepIndex !== -1 && targetView) {
        setNavigationFlow({
          currentStep: currentStepIndex,
          sectionId: sectionId,
          steps: sectionId === 'planning' ? flowSteps : devFlowSteps
        });
        setCurrentView(targetView);
        return;
      }
    }
   
    // Handle other section actions
    switch (actionId) {
      // Requirements Analysis actions
      case 'authorize-users':
        if (!authenticationAuth.authorized && !authenticationAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Authentication. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setAuthenticationInitialPage('authorize-users');
        setCurrentView('authentication');
        break;
      case 'authorize-functions':
        if (!authenticationAuth.authorized && !authenticationAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Authentication. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setAuthenticationInitialPage('authorize-functions');
        setCurrentView('authentication');
        break;
      case 'upload-document':
        if (!requirementsAuth.authorized && !requirementsAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Requirements & Feasibility Analysis. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setRequirementsInitialPage('brd-upload');
        setCurrentView('requirements-analysis');
        break;
      case 'test-analysis':
        if (!requirementsAuth.authorized && !requirementsAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Requirements & Feasibility Analysis. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setRequirementsInitialPage('test-analysis');
        setCurrentView('requirements-analysis');
        break;

      // CI-CD Pipeline actions
      case 'jenkins-pipeline':
        setCicdInitialTab('jenkins');
        setCurrentView('cicd-pipeline');
        break;
      case 'git-pipeline':
        setCicdInitialTab('git');
        setCurrentView('cicd-pipeline');
        break;
 
      // Automation Development (match main tab behavior)
      case 'dev-projects':
      case 'dev-modules':
      case 'dev-test-cases':
      case 'dev-test-steps':
        setCurrentView('automation-development');
        break;
 
      // Test Execution actions
      case 'test-suite':
        if (!testLabAuth.authorized && !testLabAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Test Lab functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setCurrentView('test-suite-management');
        break;
      case 'suite-selection':
        if (!testLabAuth.authorized && !testLabAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Test Lab functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setCurrentView('test-suites');
        break;
      case 'test-cases-exec':
        if (!testLabAuth.authorized && !testLabAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Test Lab functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setCurrentView('test-cases');
        break;
      case 'run-execution':
        if (!testLabAuth.authorized && !testLabAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Test Lab functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setCurrentView('test-execution');
        break;
      // Reporting actions
      case 'execution-history':
        if (!reportingAuth.authorized && !reportingAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Reporting functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        setCurrentView('reporting');
        break;
      case 'allure-reports':
        if (!reportingAuth.authorized && !reportingAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Reporting functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        // Directly trigger Allure report functionality
        handleIntegrationAction('allure-reports');
        break;
      case 'extent-reports':
        if (!reportingAuth.authorized && !reportingAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Reporting functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        handleIntegrationAction('extent-reports');
        break;
      case 'custom-dashboard':
        if (!reportingAuth.authorized && !reportingAuth.loading) {
          toast({
            title: "Access Denied",
            description: "You are not authorized to access Reporting functions. Please contact your administrator.",
            variant: "destructive"
          });
          return;
        }
        handleIntegrationAction('custom-dashboard');
        break;
     
      // Legacy actions for backward compatibility
      case 'projects':
        setCurrentView('projects');
        break;
      case 'modules':
        setCurrentView('modules');
        break;
      case 'test-cases':
        setCurrentView('test-cases');
        break;
      case 'test-steps':
        setCurrentView('test-cases');
        break;
      case 'strategy':
      case 'timeline':
      case 'req-analysis':
      case 'feasibility':
      case 'roi-calc':
      case 'risk-assessment':
        setCurrentView('automation-planning');
        break;
      case 'test-suites':
        setCurrentView('test-suites');
        break;
      case 'run-tests':
      case 'monitor':
      case 'parallel-exec':
      case 'debug':
        setCurrentView('test-execution');
        break;
      case 'analytics':
        setCurrentView('analytics');
        break;
      case 'export':
        setCurrentView('reporting');
        break;
      case 'recent-results':
        setCurrentView('reporting');
        break;
      case 'performance':
        setCurrentView('performance');
        break;
     
      default:
        console.log(`Unhandled action: ${actionId}`);
        toast({
          title: "Feature Coming Soon",
          description: `${actionId} functionality will be available soon.`,
        });
    }
  };
 
  const handleQuickAction = (actionId: string) => {
    // Handle direct quick actions
    handleSectionAction('quick', actionId);
  };
 
  // Handler functions for selection callbacks
  const handleProjectSelect = (project: any) => {
    setSelectedProject(project);
    // Clear downstream selections when project changes
    setSelectedModule(null);
    setSelectedTestSuite(null);
    setSelectedTestCase(null);
  };
 
  const handleModuleSelect = (module: any) => {
    setSelectedModule(module);
    // Clear downstream selections when module changes
    setSelectedTestSuite(null);
    setSelectedTestCase(null);
  };
 
  const handleTestSuiteSelect = (testSuite: any) => {
    setSelectedTestSuite(testSuite);
    // Clear downstream selections when test suite changes
    setSelectedTestCase(null);
  };
 
  const handleTestCaseSelect = (testCase: any) => {
    setSelectedTestCase(testCase);
  };
 
  const handleFunctionSelect = (func: any) => {
    setSelectedFunction(func);
    setCurrentView('user-management');
  };
 
  const handleNext = () => {
    // Handle navigation flow progression
    if (navigationFlow.currentStep < navigationFlow.steps.length - 1) {
      const nextStep = navigationFlow.currentStep + 1;
      const nextStepId = navigationFlow.steps[nextStep];
     
      setNavigationFlow(prev => ({
        ...prev,
        currentStep: nextStep
      }));
     
      // Navigate to the appropriate view based on the next step
      switch (nextStepId) {
        case 'modules':
        case 'dev-modules':
          setCurrentView('modules');
          break;
        case 'test-cases':
        case 'dev-test-cases':
          setCurrentView('test-cases');
          break;
        case 'test-steps':
        case 'dev-test-steps':
          setCurrentView('test-cases'); // Test steps are part of test cases view
          break;
        default:
          break;
      }
    }
  };
 
  const handleIntegrationAction = async (action: string) => {
    switch (action) {
      case 'allure-reports':
        try {
          // Show loading notification
          toast({
            title: "Loading Allure Report",
            description: "Checking report status...",
          });
 
          // First check if Allure report is already available
          const statusResponse = await fetch(buildApiUrl('/api/allure/status'));
         
          if (!statusResponse.ok) {
            throw new Error('Backend not responding');
          }
         
          const statusResult = await statusResponse.json();
         
          if (statusResult.report_ready && statusResult.report_url) {
            // Report is already ready, open it directly
            toast({
              title: "Opening Allure Report",
              description: "Report is ready and opening in new tab",
            });
            window.open(statusResult.report_url, '_blank');
          } else if (statusResult.available) {
            // Results are available but report needs to be generated
            toast({
              title: "Generating Allure Report",
              description: "Test results found, generating report...",
            });
           
            const generateResponse = await fetch(buildApiUrl('/api/allure/generate'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            });
           
            const generateResult = await generateResponse.json();
           
            if (generateResult.success) {
              // Open the newly generated report
              toast({
                title: "Report Generated",
                description: "Allure report opened in new tab",
              });
              window.open(generateResult.report_url, '_blank');
            } else {
              toast({
                title: "Generation Failed",
                description: generateResult.error || "Failed to generate Allure report",
                variant: "destructive"
              });
            }
          } else {
            toast({
              title: "No Test Results",
              description: "Please run a test first to generate Allure results",
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error('Failed to access Allure report:', error);
          toast({
            title: "Connection Error",
            description: "Failed to access Allure report. Please ensure the backend is running.",
            variant: "destructive"
          });
        }
        break;
      case 'extent-reports':
        try {
          toast({
            title: "Loading Extent Report",
            description: "Checking report status...",
          });

          const statusResponse = await fetch(buildApiUrl('/api/extent/status'));
          if (!statusResponse.ok) {
            throw new Error('Backend not responding');
          }

          const statusResult = await statusResponse.json();

          if (statusResult.report_ready && statusResult.report_url && statusResult.framework === 'extent-spark') {
            toast({
              title: "Opening Extent Report",
              description: "Report is ready and opening in new tab",
            });
            window.open(statusResult.report_url, '_blank');
          } else if (statusResult.available) {
            const shouldForceRegenerate = statusResult.legacy_detected === true;
            toast({
              title: shouldForceRegenerate ? "Refreshing Extent Report" : "Generating Extent Report",
              description: shouldForceRegenerate
                ? "Legacy report detected, regenerating with Extent framework..."
                : "Test results found, generating report...",
            });

            const generateResponse = await fetch(buildApiUrl(shouldForceRegenerate ? '/api/extent/force-regenerate' : '/api/extent/generate'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            const generateResult = await generateResponse.json();
            if (generateResult.success && generateResult.report_url) {
              toast({
                title: "Report Generated",
                description: "Extent report opened in new tab",
              });
              window.open(generateResult.report_url, '_blank');
            } else {
              toast({
                title: "Generation Failed",
                description: generateResult.error || "Failed to generate Extent report",
                variant: "destructive"
              });
            }
          } else {
            toast({
              title: "No Test Results",
              description: "Please run a test first to generate Extent results",
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error('Failed to access Extent report:', error);
          toast({
            title: "Connection Error",
            description: "Failed to access Extent report. Please ensure the backend is running.",
            variant: "destructive"
          });
        }
        break;
      case 'custom-dashboard':
        try {
          toast({
            title: "Loading Custom Dashboard",
            description: "Checking dashboard status...",
          });

          const statusResponse = await fetch(buildApiUrl('/api/results/publish/status'));
          if (!statusResponse.ok) {
            throw new Error('Backend not responding');
          }

          const statusResult = await statusResponse.json();
          const customStatus = statusResult.reports?.custom_dashboard;
          const shouldForceRegenerate =
            customStatus?.legacy_detected === true || customStatus?.framework !== 'custom-results-v2';

          if (customStatus?.report_ready && customStatus?.report_url && !shouldForceRegenerate) {
            toast({
              title: "Opening Custom Dashboard",
              description: "Dashboard is ready and opening in new tab",
            });
            window.open(customStatus.report_url, '_blank');
          } else {
            toast({
              title: shouldForceRegenerate ? "Refreshing Custom Dashboard" : "Generating Custom Dashboard",
              description: shouldForceRegenerate
                ? "Legacy dashboard detected, regenerating the detailed layout..."
                : "Generating the latest custom dashboard...",
            });

            const publishResponse = await fetch(buildApiUrl('/api/results/publish'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                publish_targets: ['custom_dashboard'],
                execution_context: {
                  title: 'Reporting Dashboard'
                }
              })
            });

            const publishResult = await publishResponse.json();
            const generatedDashboard = publishResult.reports?.custom_dashboard;

            if (publishResult.success && generatedDashboard?.url) {
              toast({
                title: "Dashboard Ready",
                description: "Custom dashboard opened in new tab",
              });
              window.open(generatedDashboard.url, '_blank');
            } else {
              toast({
                title: "Generation Failed",
                description: generatedDashboard?.message || publishResult.error || "Failed to generate Custom Dashboard",
                variant: "destructive"
              });
            }
          }
        } catch (error) {
          console.error('Failed to access custom dashboard:', error);
          toast({
            title: "Connection Error",
            description: "Failed to access Custom Dashboard. Please ensure the backend is running.",
            variant: "destructive"
          });
        }
        break;
      case 'cicd-integration':
        // Handle CI/CD integration setup
        console.log('Opening CI/CD integration setup...');
        break;
      default:
        console.log(`Unknown integration action: ${action}`);
    }
  };
 
  const handleBack = () => {
    setCurrentView('main');
    setCurrentSection('');
  };

  const renderCurrentContent = () => {
 
    switch (currentView) {
      case 'automation-planning':
        return <AutomationPlanningDashboard onBack={handleBack} />;
     
      case 'projects':
        return (
          <ProjectDashboard
            onBack={handleBack}
            onProjectSelect={handleProjectSelect}
            onNext={handleNext}
          />
        );
     
      case 'modules':
        return (
          <ModulesDashboard
            selectedProject={selectedProject}
            onBack={handleBack}
            onModuleSelect={handleModuleSelect}
            onNext={handleNext}
            readOnlyMode={currentSection === 'development'}
          />
        );
     
      case 'test-suites':
        return (
          <TestSuiteDashboard
            selectedModule={selectedModule}
            onBack={handleBack}
            onNext={handleNext}
            onSuiteSelect={handleTestSuiteSelect}
          />
        );
     
      case 'test-cases':
        return (
          <TestCaseDashboard
            selectedProject={selectedProject}
            selectedModule={selectedModule}
            selectedTestSuite={selectedTestSuite}
            onBack={handleBack}
            onTestCaseSelect={handleTestCaseSelect}
            onNext={handleNext}
            readOnlyMode={currentSection === 'development'}
          />
        );
     
      case 'test-execution':
        return <TestExecutionDashboard onBack={handleBack} />;
 
      case 'test-suite-management':
        return <TestSuite onBack={handleBack} />;
     
      case 'reporting':
        return <ReportingDashboard onBack={handleBack} />;
     
      case 'analytics':
        return <AnalyticsDashboard onBack={handleBack} />;
     
      case 'recent-results':
        return <RecentResults onBack={handleBack} />;
     
      case 'performance':
        return <PerformanceDashboard onBack={handleBack} />;
 
      case 'automation-development':
        return <AutomationDevelopmentDashboard onBack={handleBack} initialView={devInitialView} />;
 
      case 'requirements-analysis':
        return <RequirementsAnalysisDashboard initialPage={requirementsInitialPage} onBack={handleBack} onFunctionSelect={handleFunctionSelect} />;

      case 'authentication':
        return <AuthenticationDashboard initialPage={authenticationInitialPage} onBack={handleBack} onFunctionSelect={handleFunctionSelect} />;

      case 'cicd-pipeline':
        return <CicdPipelineDashboard initialTab={cicdInitialTab} onBack={handleBack} />;
 
      case 'user-management':
        return (
          <UserManagement
            selectedFunction={selectedFunction}
            onBack={handleBack}
          />
        );
 
      default:
        return <MainDashboard onFunctionSelect={handleFunctionSelect} />;
    }
  };
 
  return (
    <SidebarProvider>
      <div className="app-shell min-h-screen flex w-full">
        <ProfessionalSidebar
          onSectionAction={handleSectionAction}
          onQuickAction={handleQuickAction}
          navigationFlow={navigationFlow}
          onSectionSelect={(sectionId) => {
            // Navigate to section overview when header is clicked
            if (sectionId === 'requirements') {
              if (!requirementsAuth.authorized && !requirementsAuth.loading) {
                toast({
                  title: "Access Denied",
                  description: "You are not authorized to access Requirements & Feasibility Analysis. Please contact your administrator.",
                  variant: "destructive"
                });
                return;
              }
              setCurrentSection('requirements');
              setRequirementsInitialPage('blocks');
              setCurrentView('requirements-analysis');
            } else if (sectionId === 'authentication') {
              if (!authenticationAuth.authorized && !authenticationAuth.loading) {
                toast({
                  title: "Access Denied",
                  description: "You are not authorized to access Authentication. Please contact your administrator.",
                  variant: "destructive"
                });
                return;
              }
              setCurrentSection('authentication');
              setAuthenticationInitialPage('blocks');
              setCurrentView('authentication');
            } else if (sectionId === 'planning') {
              if (!planningAuth.authorized && !planningAuth.loading) {
                toast({
                  title: "Access Denied",
                  description: "You are not authorized to access Automation Planning. Please contact your administrator.",
                  variant: "destructive"
                });
                return;
              }
              setCurrentSection('planning');
              setCurrentView('automation-planning');
            } else if (sectionId === 'development') {
              if (!developmentAuth.authorized && !developmentAuth.loading) {
                toast({
                  title: "Access Denied",
                  description: "You are not authorized to access Automation Development. Please contact your administrator.",
                  variant: "destructive"
                });
                return;
              }
              setCurrentSection('development');
              setDevInitialView('overview');
              setCurrentView('automation-development');
            } else if (sectionId === 'cicd') {
              setCurrentSection('cicd');
              setCicdInitialTab('jenkins');
              setCurrentView('cicd-pipeline');
            }
          }}
          onHomeClick={() => {
            setCurrentView('main');
            setCurrentSection('');
            // Reset navigation flow
            setNavigationFlow({
              currentStep: 0,
              sectionId: '',
              steps: ['projects', 'modules', 'test-cases', 'test-steps']
            });
            // Clear selections
            setSelectedProject(null);
            setSelectedModule(null);
            setSelectedTestSuite(null);
            setSelectedTestCase(null);
          }}
        />
       
        <SidebarInset className="flex-1">
          <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
            <div className="w-full px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <SidebarTrigger className="hover:bg-accent transition-colors" />
                  <div className="flex items-center space-x-4">
                    <img
                      src={LogoImage}
                      alt="Quinnox Logo"
                      className="h-16 w-16 md:h-20 md:w-20 object-contain rounded-md border border-border bg-card p-1.5"
                    />
                    <div>
                      <h1 className="text-xl md:text-3xl font-bold text-foreground tracking-tight">
                        QFast Automation Platform
                      </h1>
                      <p className="text-muted-foreground text-sm md:text-base flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span>Quinnox Framework for AI-Driven Smart Testing</span>
                        <Zap className="w-4 h-4 text-primary" />
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="glass-effect px-4 py-2 rounded-lg hidden lg:flex items-center space-x-2 text-sm text-muted-foreground">
                    <Database className="w-4 h-4 text-primary" />
                    <span>Quinnox_TestAutomation DB</span>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
 
          {/* Main Content */}
          <div className="w-full">
          {renderCurrentContent()}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};
 
export default Index;
