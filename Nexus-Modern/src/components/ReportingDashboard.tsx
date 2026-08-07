import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3, CheckCircle, XCircle, Clock, Eye, Download, RefreshCw, ExternalLink, ChartColumn, History, LayoutDashboard } from 'lucide-react';
import PhaseStepCard from '@/components/ui/phase-step-card';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import PageBackButton from '@/components/ui/page-back-button';

// Import the existing TestResultsDashboard
import TestResultsDashboard from './TestResultsDashboard';

interface TestExecution {
  id: string;
  execution_id: string;
  test_suite: string;
  execution_date: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL_PASS' | 'IN_PROGRESS';
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  execution_time: string;
  test_cases: string[];
  project_name?: string;
  module_name?: string;
  total_steps?: number;
  passed_steps?: number;
  failed_steps?: number;
  executor_type?: string;
}

interface ReportingDashboardProps {
  onBack?: () => void;
}

interface PublishReportStatus {
  available: boolean;
  report_ready: boolean;
  report_url?: string | null;
  json_url?: string | null;
  framework?: string | null;
  legacy_detected?: boolean;
}

const ReportingDashboard: React.FC<ReportingDashboardProps> = ({ onBack }) => {
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [reportStatus, setReportStatus] = useState<Record<string, PublishReportStatus>>({});
  
  const { toast } = useToast();

  useEffect(() => {
    loadExecutions();
    loadPublishStatus();
  }, []);

  const loadExecutions = async () => {
    try {
      setIsLoading(true);
      // Load all test executions from the database
      const response = await fetch(buildApiUrl('/api/results'));
      if (response.ok) {
        const data = await response.json();
        console.log('Raw execution data:', data);
        
        // Group executions by testcase_name and execution date to create proper execution records
        const executionMap = new Map();
        
        (data || []).forEach((result: any) => {
          // Debug: Log each result to see what data we're getting
          console.log('🔍 Processing execution result:', {
            testcase_name: result.testcase_name,
            projectname: result.projectname,
            modulename: result.modulename,
            testsuitename: result.testsuitename,
            status: result.status
          });
          
          const executionKey = `${result.testcase_name}_${result.execution_date || result.created_date}`;
          
          if (!executionMap.has(executionKey)) {
            // Determine status based on step results if available
            let finalStatus;
            if (result.status === 'PASS' || result.status === 'FAIL') {
              // Use the provided status if it's explicitly set
              finalStatus = result.status;
            } else if (result.passed_steps > 0 && result.failed_steps > 0) {
              // If there are both passed and failed steps, mark as PARTIAL_PASS
              finalStatus = 'PARTIAL_PASS';
            } else if (result.failed_steps > 0 && result.passed_steps === 0) {
              // If only failed steps, mark as FAIL
              finalStatus = 'FAIL';
            } else if (result.passed_steps > 0 && result.failed_steps === 0) {
              // If only passed steps and no failed steps, mark as PASS
              finalStatus = 'PASS';
            } else {
              // Otherwise, it's still in progress
              finalStatus = 'IN_PROGRESS';
            }
            
            executionMap.set(executionKey, {
              id: result.id?.toString() || Date.now().toString(),
              execution_id: result.testcase_name || 'Unknown Test Case',
              test_suite: result.testsuitename || 'general',
              execution_date: result.execution_date || result.created_date || new Date().toISOString(),
              status: finalStatus,
              total_tests: 1,
              passed_tests: finalStatus === 'PASS' ? 1 : 0,
              failed_tests: (finalStatus === 'FAIL' || finalStatus === 'PARTIAL_PASS') ? 1 : 0,
              execution_time: result.execution_time || 'N/A',
              test_cases: [result.testcase_name || 'Unknown'],
              project_name: result.projectname,
              module_name: result.modulename,
              total_steps: result.total_steps || 0,
              passed_steps: result.passed_steps || 0,
              failed_steps: result.failed_steps || 0,
              executor_type: result.executor_type || 'selenium'
            });
          }
        });
        
        const formattedExecutions = Array.from(executionMap.values()).sort((a, b) => 
          new Date(b.execution_date).getTime() - new Date(a.execution_date).getTime()
        );
        
        console.log('Formatted executions:', formattedExecutions);
        setExecutions(formattedExecutions);
      } else {
        console.log('No execution data found');
        setExecutions([]);
      }
    } catch (error) {
      console.error('Error loading executions:', error);
      toast({
        title: "Error",
        description: "Failed to load execution history from database",
        variant: "destructive"
      });
      setExecutions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPublishStatus = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/results/publish/status'));
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setReportStatus(data.reports || {});
    } catch (error) {
      console.error('Error loading publish status:', error);
    }
  };

  const handleViewDetails = (execution: TestExecution) => {
    setSelectedExecution(execution);
    setShowDetailedResults(true);
  };

  const handleBackToList = () => {
    setShowDetailedResults(false);
    setSelectedExecution(null);
  };

  const handleAllureReport = async () => {
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
          title: "No Results Available",
          description: "No test results found to generate Allure report",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error handling Allure report:', error);
      toast({
        title: "Error",
        description: "Failed to access Allure report. Please check if the backend is running.",
        variant: "destructive"
      });
    }
  };

  const handleExtentReport = async () => {
    try {
      toast({
        title: "Loading Extent Report",
        description: "Checking report status...",
      });

      const statusResponse = await fetch(buildApiUrl('/api/extent/status'));
      if (!statusResponse.ok) throw new Error('Backend not responding');
      const statusResult = await statusResponse.json();

      if (statusResult.report_ready && statusResult.report_url && statusResult.framework === 'extent-spark') {
        toast({ title: "Opening Extent Report", description: "Report is ready and opening in new tab" });
        window.open(statusResult.report_url, '_blank');
      } else if (statusResult.available) {
        const shouldForceRegenerate = statusResult.legacy_detected === true;
        toast({
          title: shouldForceRegenerate ? "Refreshing Extent Report" : "Generating Extent Report",
          description: shouldForceRegenerate
            ? "Legacy report detected, regenerating with Extent framework..."
            : "Test results found, generating report..."
        });
        const generateResponse = await fetch(buildApiUrl(shouldForceRegenerate ? '/api/extent/force-regenerate' : '/api/extent/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const generateResult = await generateResponse.json();
        if (generateResult.success) {
          toast({ title: "Report Generated", description: "Extent report opened in new tab" });
          window.open(generateResult.report_url, '_blank');
          loadPublishStatus();
        } else {
          toast({ title: "Generation Failed", description: generateResult.error || "Failed to generate Extent report", variant: "destructive" });
        }
      } else {
        toast({ title: "No Results Available", description: "No test results found to generate Extent report", variant: "destructive" });
      }
    } catch (error) {
      console.error('Error handling Extent report:', error);
      toast({ title: "Error", description: "Failed to access Extent report. Please check if the backend is running.", variant: "destructive" });
    }
  };

  const handlePublishReport = async (target: 'extent' | 'custom_dashboard') => {
    try {
      // Use dedicated extent API for extent reports
      if (target === 'extent') {
        await handleExtentReport();
        return;
      }

      const currentStatus = reportStatus[target];
      const shouldForceRegenerateCustomDashboard =
        target === 'custom_dashboard' &&
        (currentStatus?.legacy_detected === true || currentStatus?.framework !== 'custom-results-v2');

      if (currentStatus?.report_ready && currentStatus.report_url && !shouldForceRegenerateCustomDashboard) {
        window.open(currentStatus.report_url, '_blank');
        return;
      }

      toast({
        title: "Publishing Report",
        description: shouldForceRegenerateCustomDashboard
          ? "Refreshing Custom Dashboard with the new detailed layout..."
          : `Generating Custom Dashboard output...`,
      });

      const response = await fetch(buildApiUrl('/api/results/publish'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publish_targets: [target],
          execution_context: {
            title: 'Reporting Dashboard'
          }
        })
      });

      const data = await response.json();
      const targetReport = data.reports?.[target];
      if (data.success && targetReport?.url) {
        window.open(targetReport.url, '_blank');
        loadPublishStatus();
        toast({
          title: "Report Ready",
          description: `${target === 'extent' ? 'Extent' : 'Custom Dashboard'} opened in a new tab.`,
        });
        return;
      }

      toast({
        title: "Report Generation Failed",
        description: targetReport?.message || 'Unable to publish report',
        variant: "destructive"
      });
    } catch (error) {
      console.error(`Error handling ${target} report:`, error);
      toast({
        title: "Error",
        description: "Failed to publish report.",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'FAIL':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'PARTIAL_PASS':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getSuiteColor = (suite: string) => {
    switch (suite) {
      case 'smoke':
        return 'bg-orange-100 text-orange-700';
      case 'sanity':
        return 'bg-blue-100 text-blue-700';
      case 'regression':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const calculateSummary = () => {
    const total = executions.length;
    const passed = executions.filter(e => e.status === 'PASS').length;
    const failed = executions.filter(e => e.status === 'FAIL').length;
    const partialPass = executions.filter(e => e.status === 'PARTIAL_PASS').length;
    const inProgress = executions.filter(e => e.status === 'IN_PROGRESS').length;
    
    // Calculate pass rate including all executions with completed steps
    const totalCompletedTests = executions.reduce((sum, e) => {
      if (e.status === 'PASS' || e.status === 'FAIL') {
        return sum + e.total_tests;
      } else if ((e.status === 'PARTIAL_PASS' || e.status === 'IN_PROGRESS') && e.total_steps > 0) {
        return sum + (e.passed_steps + e.failed_steps);
      }
      return sum;
    }, 0);
    
    const totalPassedTests = executions.reduce((sum, e) => {
      if (e.status === 'PASS') {
        return sum + e.passed_tests;
      } else if ((e.status === 'PARTIAL_PASS' || e.status === 'IN_PROGRESS') && e.total_steps > 0) {
        return sum + e.passed_steps;
      }
      return sum;
    }, 0);
    
    const passRate = totalCompletedTests > 0 ? (totalPassedTests / totalCompletedTests) * 100 : 0;

    return { total, passed, failed, partialPass, inProgress, passRate };
  };

  const summary = calculateSummary();

  // Memoize selectedTestCase to prevent unnecessary re-renders and flickering
  const memoizedSelectedTestCase = useMemo(() => {
    if (!selectedExecution) return null;
    return {
      name: selectedExecution.test_cases[0] || selectedExecution.execution_id,
      execution_id: selectedExecution.id
    };
  }, [selectedExecution?.test_cases, selectedExecution?.execution_id, selectedExecution?.id]);

  if (showDetailedResults && selectedExecution && memoizedSelectedTestCase) {
    return (
      <TestResultsDashboard 
        selectedTestCase={memoizedSelectedTestCase}
        onBack={handleBackToList}
      />
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <Clock className="w-5 h-5 animate-spin" />
            <span>Loading test execution reports...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Main Menu" />

      {/* Header */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-pink-500 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-gray-900">Reporting Dashboard</CardTitle>
                <p className="text-gray-600">View test execution results and detailed analytics</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                onClick={handleAllureReport}
                variant="outline" 
                className="border-purple-500/20 text-purple-600 hover:bg-purple-50"
              >
                <ChartColumn className="w-4 h-4 mr-2" />
                View Allure Report
              </Button>
              <Button 
                onClick={() => handlePublishReport('extent')}
                variant="outline" 
                className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Extent Report
              </Button>
              <Button 
                onClick={() => handlePublishReport('custom_dashboard')}
                variant="outline" 
                className="border-sky-200 text-sky-600 hover:bg-sky-50"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Custom Dashboard
              </Button>
              <Button 
                onClick={() => {
                  loadExecutions();
                  loadPublishStatus();
                }}
                variant="outline" 
                className="border-green-200 text-green-600"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Reporting phase sub-steps - same card anatomy as the Home phase cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <PhaseStepCard
          icon={History}
          title="Execution History"
          description="Browse every run and open detailed per-test results"
          step="Step 1"
          accent="cyan"
          onClick={() => {
            document
              .getElementById('reporting-execution-history')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
        <PhaseStepCard
          icon={LayoutDashboard}
          title="Overall Reports"
          description="Generate and open the custom results dashboard"
          step="Step 2"
          accent="sky"
          onClick={() => handlePublishReport('custom_dashboard')}
        />
        <PhaseStepCard
          icon={ChartColumn}
          title="Allure Report"
          description="Generate and open the Allure report for the latest run"
          step="Step 3"
          accent="purple"
          onClick={handleAllureReport}
        />
        <PhaseStepCard
          icon={ExternalLink}
          title="Extent Report"
          description="Generate and open the Extent Spark report"
          step="Step 4"
          accent="indigo"
          onClick={() => handlePublishReport('extent')}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 backdrop-blur-sm border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm">Total Executions</p>
                <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 backdrop-blur-sm border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm">Passed</p>
                <p className="text-2xl font-bold text-gray-900">{summary.passed}</p>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/10 backdrop-blur-sm border-red-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-600 text-sm">Failed</p>
                <p className="text-2xl font-bold text-gray-900">{summary.failed}</p>
              </div>
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 backdrop-blur-sm border-orange-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-600 text-sm">Partial Pass</p>
                <p className="text-2xl font-bold text-gray-900">{summary.partialPass}</p>
              </div>
              <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/10 backdrop-blur-sm border-yellow-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-600 text-sm">In Progress</p>
                <p className="text-2xl font-bold text-gray-900">{summary.inProgress}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/10 backdrop-blur-sm border-indigo-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-600 text-sm">Pass Rate</p>
                <p className="text-2xl font-bold text-gray-900">{summary.passRate.toFixed(1)}%</p>
              </div>
              <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Execution History */}
      <Card id="reporting-execution-history" className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">Execution History</CardTitle>
          <p className="text-gray-600">Click on any execution to view detailed results</p>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No execution history found</p>
              <p className="text-sm text-gray-500">Execute some test cases to see results here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {executions.map((execution) => (
              <Card 
                key={execution.id} 
                className="border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                onClick={() => handleViewDetails(execution)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4 mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {execution.execution_id}
                        </h3>
                        <Badge className={getStatusColor(execution.status)}>
                          {execution.status === 'PARTIAL_PASS' ? 'PARTIAL PASS' : execution.status}
                        </Badge>
                        <Badge className={getSuiteColor(execution.test_suite)}>
                          {execution.test_suite.toUpperCase()} Suite
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Execution Date:</span><br/>
                          {(() => {
                            try {
                              const dateStr = execution.execution_date;
                              
                              if (!dateStr) return 'N/A';
                              
                              // Handle different date formats more reliably
                              let date;
                              
                              if (typeof dateStr === 'string') {
                                // Try to parse as ISO string first (handles UTC with Z suffix)
                                if (dateStr.includes('T') || dateStr.includes('Z')) {
                                  date = new Date(dateStr);
                                  // Check if the date is valid
                                  if (isNaN(date.getTime())) {
                                    throw new Error('Invalid date format');
                                  }
                                } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                                  // YYYY-MM-DD format - assume local time
                                  date = new Date(dateStr);
                                } else if (dateStr.includes('/')) {
                                  // DD/MM/YYYY format - parse manually
                                  const [day, month, year] = dateStr.split('/').map(Number);
                                  date = new Date(year, month - 1, day);
                                } else {
                                  // Fallback to Date constructor
                                  date = new Date(dateStr);
                                }
                              } else {
                                date = new Date(dateStr);
                              }
                              
                              // Format to local time in en-IN format
                              return date.toLocaleString('en-IN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false
                              });
                            } catch (error) {
                              console.error('Date formatting error:', error);
                              return formatExecutionDate(execution.execution_date);
                            }
                          })()}
                        </div>
                        <div>
                          <span className="font-medium">Duration:</span><br/>
                          {execution.execution_time}
                        </div>
                        <div>
                          <span className="font-medium">Module:</span><br/>
                          {execution.module_name || 'Unknown Module'}
                        </div>
                        <div>
                          <span className="font-medium">Executor Type:</span><br/>
                          <Badge className={`${
                            execution.executor_type === 'playwright' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            execution.executor_type === 'cypress' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                            'bg-blue-100 text-blue-700 border-blue-200'
                          }`}>
                            {execution.executor_type === 'playwright' ? 'Playwright' : execution.executor_type === 'cypress' ? 'Cypress' : 'Selenium'}
                          </Badge>
                        </div>
                        <div>
                          <span className="font-medium">Step Results:</span><br/>
                          <span className="text-green-600 font-semibold">{execution.passed_steps || 0} Passed</span>
                          {(execution.failed_steps || 0) > 0 && (
                            <span className="text-red-600 font-semibold ml-2">{execution.failed_steps} Failed</span>
                          )}
                          <span className="text-gray-500 ml-2">/ {execution.total_steps || 0} Total</span>
                        </div>
                        <div>
                          <span className="font-medium">Overall Status:</span><br/>
                          <span className={`font-semibold ${execution.status === 'PASS' ? 'text-green-600' : execution.status === 'PARTIAL_PASS' ? 'text-orange-600' : 'text-red-600'}`}>
                            {execution.status === 'PARTIAL_PASS' ? 'PARTIAL PASS' : execution.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          // Handle export functionality
                          toast({
                            title: "Export Started",
                            description: "Exporting execution results...",
                          });
                        }}
                        variant="outline" 
                        size="sm"
                        className="border-blue-200 text-blue-600"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-green-200 text-green-600"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                  
                  {/* Progress Bar for Pass Rate */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Pass Rate</span>
                      <span>{(() => {
                        let totalCompleted, passedCompleted;
                        
                        if ((execution.status === 'IN_PROGRESS' || execution.status === 'PARTIAL_PASS') && execution.total_steps > 0) {
                          // For IN_PROGRESS and PARTIAL_PASS, use step-level data
                          totalCompleted = execution.passed_steps + execution.failed_steps;
                          passedCompleted = execution.passed_steps;
                        } else {
                          // For PASS/FAIL tests, use test-level data
                          totalCompleted = execution.total_tests;
                          passedCompleted = execution.passed_tests;
                        }
                        
                        return totalCompleted > 0 ? ((passedCompleted / totalCompleted) * 100).toFixed(1) : 0;
                      })()}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${(() => {
                          if ((execution.status === 'IN_PROGRESS' || execution.status === 'PARTIAL_PASS') && execution.total_steps > 0) {
                            return execution.failed_steps === 0 ? 'bg-green-500' : 'bg-gradient-to-r from-green-500 to-red-500';
                          }
                          return execution.failed_tests === 0 ? 'bg-green-500' : 'bg-gradient-to-r from-green-500 to-red-500';
                        })()}`}
                        style={{ width: `${(() => {
                          let totalCompleted, passedCompleted;
                          
                          if ((execution.status === 'IN_PROGRESS' || execution.status === 'PARTIAL_PASS') && execution.total_steps > 0) {
                            totalCompleted = execution.passed_steps + execution.failed_steps;
                            passedCompleted = execution.passed_steps;
                          } else {
                            totalCompleted = execution.total_tests;
                            passedCompleted = execution.passed_tests;
                          }
                          
                          return totalCompleted > 0 ? (passedCompleted / totalCompleted) * 100 : 0;
                        })()}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportingDashboard;
