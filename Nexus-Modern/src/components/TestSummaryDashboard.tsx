import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, ArrowLeft, CheckCircle, AlertCircle, Clock, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';

interface TestStep {
  id: number;
  tc_id: string;
  step_no: number;
  test_step_description: string;
  element_name: string;
  action_type: string;
  xpath: string;
  values: string;
}

interface TestSummaryDashboardProps {
  selectedProject: any;
  selectedTestCase: any;
  testSteps: TestStep[];
  onExecute: () => void;
  onBack: () => void;
}

const TestSummaryDashboard: React.FC<TestSummaryDashboardProps> = ({ 
  selectedProject, 
  selectedTestCase, 
  testSteps,
  onExecute, 
  onBack 
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const { toast } = useToast();

  // Debug logging for test steps
  console.log(`[DEBUG] TestSummaryDashboard received:`, {
    selectedProject: selectedProject?.name,
    selectedTestCase: selectedTestCase?.name,
    testStepsCount: testSteps?.length || 0,
    testSteps: testSteps
  });

  const saveTestStepsToDatabase = async () => {
    try {
      console.log('Saving test steps to database...');
      setExecutionLogs(prev => [...prev, 'Saving test steps to database table: ' + selectedTestCase.name]);
      
      // Use bulk insert endpoint for better performance
      const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(selectedTestCase.name)}/bulk`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedTestCase.id,
          project_name: selectedTestCase.project_name || selectedTestCase.project,
          module_name: selectedTestCase.module_name || selectedTestCase.module,
          steps: testSteps.map(step => ({
            tc_id: step.tc_id || 'TC001',
            step_no: step.step_no,
            test_step_description: step.test_step_description,
            element_name: step.element_name,
            action_type: step.action_type,
            xpath: step.xpath || '',
            values: step.values || ''
          })),
          clear_existing: true // Clear any existing steps before inserting
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save test steps: ${errorText}`);
      }

      const result = await response.json();
      setExecutionLogs(prev => [...prev, `[SUCCESS] Successfully saved ${result.count} test steps to ${selectedTestCase.name} table`]);
      return true;
    } catch (error) {
      console.error('Error saving test steps:', error);
      setExecutionLogs(prev => [...prev, `[ERROR] Error saving test steps: ${error}`]);
      return false;
    }
  };

  const executeSeleniumTest = async () => {
    try {
      console.log('Starting Selenium test execution...');
      setExecutionLogs(prev => [...prev, 'Starting real Selenium test execution...']);
      setExecutionLogs(prev => [...prev, 'Reading test steps from database...']);
      setExecutionLogs(prev => [...prev, 'Launching Chrome browser...']);
      
      console.log('Making API call to:', buildApiUrl(`/api/execute/${selectedTestCase.name}`));
      
      const response = await fetch(buildApiUrl(`/api/execute/${selectedTestCase.name}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add a timeout of 5 minutes for test execution
        signal: AbortSignal.timeout(300000)
      });

      console.log('API response status:', response.status);
      console.log('API response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`Failed to execute test: ${errorText}`);
      }

      const result = await response.json();
      
      console.log('Test execution result:', result);
      console.log('Result success:', result.success);
      console.log('Result status:', result.status);
      const normalizedStatus = String(result.status || (result.success ? 'PASS' : 'FAIL')).toUpperCase();
      const statusLabel = normalizedStatus === 'PARTIAL_PASS' ? 'PARTIAL PASS' : normalizedStatus;
      
      if (result.success) {
        setExecutionLogs(prev => [...prev, `[RESULT] Test execution completed with status: ${statusLabel}`]);
        setExecutionLogs(prev => [...prev, `Overall Status: ${statusLabel}`]);
        setExecutionLogs(prev => [...prev, `Total Steps Executed: ${result.total_steps}`]);
        setExecutionLogs(prev => [...prev, `Steps Passed: ${result.passed_steps}`]);
        setExecutionLogs(prev => [...prev, `Steps Failed: ${result.failed_steps}`]);
        setExecutionLogs(prev => [...prev, `Execution Time: ${result.execution_time}`]);
        setExecutionLogs(prev => [...prev, `Results saved to ${selectedTestCase.name}_Results table in database`]);
        
        toast({
          title: normalizedStatus === 'PASS' ? 'Test Passed' : normalizedStatus === 'PARTIAL_PASS' ? 'Test Partially Passed' : 'Test Execution Completed',
          description: `Status: ${statusLabel} - ${result.passed_steps}/${result.total_steps} steps passed`,
          variant: normalizedStatus === "PASS" ? "default" : "destructive"
        });
        
        console.log('[SUCCESS] Test execution completed successfully, returning result');
        return result;
      } else {
        console.error('Test execution failed:', result);
        const errorMsg = result.error || result.error_message || 'Test execution failed - no error details provided';
        console.error('Error message:', errorMsg);
        throw new Error(errorMsg);
      }

    } catch (error) {
      console.error('Error executing test:', error);
      setExecutionLogs(prev => [...prev, `[ERROR] Error executing test: ${error}`]);
      
      toast({
        title: "Test Execution Failed",
        description: `Error: ${error}`,
        variant: "destructive"
      });
      
      console.log('[ERROR] Test execution failed, returning null');
      return null;
    }
  };

  const handleExecuteTests = async () => {
    if (!selectedTestCase) {
      toast({
        title: "Error",
        description: "No test case selected",
        variant: "destructive"
      });
      return;
    }

    if (!testSteps || testSteps.length === 0) {
      toast({
        title: "Error",
        description: "No test steps configured. Please go back and add test steps.",
        variant: "destructive"
      });
      return;
    }

    setIsExecuting(true);
    setExecutionProgress(0);
    setExecutionLogs([]);

    try {
      // Step 1: Save test steps to database
      setExecutionProgress(20);
      setExecutionLogs(prev => [...prev, `Preparing to save ${testSteps.length} test steps...`]);
      const savedSuccessfully = await saveTestStepsToDatabase();
      
      if (!savedSuccessfully) {
        throw new Error('Failed to save test steps to database');
      }

      // Step 2: Execute Selenium test
      setExecutionProgress(40);
      setExecutionLogs(prev => [...prev, 'Initiating Selenium WebDriver...']);
      console.log('About to call executeSeleniumTest...');
      const executionResult = await executeSeleniumTest();
      
      console.log('executeSeleniumTest returned:', executionResult);
      
      if (!executionResult) {
        console.error('executeSeleniumTest returned null/undefined');
        throw new Error('Test execution failed');
      }

      if (!executionResult.success) {
        console.error('executeSeleniumTest returned success=false');
        throw new Error(executionResult.error || 'Test execution failed');
      }

      setExecutionProgress(100);
      setExecutionLogs(prev => [...prev, 'Test execution workflow completed successfully!']);
      
      // Add final status message based on test results
      const normalizedStatus = String(executionResult.status || (executionResult.success ? 'PASS' : 'FAIL')).toUpperCase();
      const statusLabel = normalizedStatus === 'PARTIAL_PASS' ? 'PARTIAL PASS' : normalizedStatus;
      if (normalizedStatus === "PASS") {
        setExecutionLogs(prev => [...prev, `[PASS] All tests passed. Status: ${statusLabel}`]);
      } else if (normalizedStatus === 'PARTIAL_PASS') {
        setExecutionLogs(prev => [...prev, `[PARTIAL PASS] Some steps were missed or failed. Status: ${statusLabel}`]);
      } else {
        setExecutionLogs(prev => [...prev, `[FAIL] Test execution failed. Status: ${statusLabel}`]);
      }
      
      // Show Allure report notification
      setExecutionLogs(prev => [...prev, '[REPORT] Allure report auto-generated! Check sidebar for reports.']);
      
      toast({
        title: normalizedStatus === 'PASS' ? 'Test Execution Complete' : normalizedStatus === 'PARTIAL_PASS' ? 'Test Partially Passed' : 'Test Failed',
        description: `Test ${statusLabel}. Allure report has been generated automatically.`,
        variant: normalizedStatus === "PASS" ? "default" : "destructive"
      });
      
      console.log('Setting up navigation timeout...');
      
      // Navigate to results after a short delay
      setTimeout(() => {
        console.log('Timeout fired, about to navigate...');
        setIsExecuting(false);
        console.log('Calling onExecute() to navigate to results dashboard...');
        onExecute();
      }, 2000);

    } catch (error) {
      setIsExecuting(false);
      setExecutionProgress(0);
      
      console.error('Test execution error:', error);
      
      toast({
        title: "Execution Failed",
        description: `Error: ${error}`,
        variant: "destructive"
      });
    }
  };

  if (!selectedProject || !selectedTestCase) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <p className="text-gray-600">Please complete previous steps first</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Configuration" />

      {/* Header Section */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-gray-900 flex items-center space-x-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <span>Test Execution Summary</span>
              </CardTitle>
              <p className="text-gray-600 mt-2">Review your test configuration before execution</p>
            </div>
            <div />
          </div>
        </CardHeader>
      </Card>

      {/* Project & Test Case Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 backdrop-blur-sm border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span>Project Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-blue-600">Project Name</p>
                <p className="text-gray-900 font-medium">{selectedProject.name}</p>
              </div>
              <div>
                <p className="text-sm text-blue-600">Description</p>
                <p className="text-gray-900">{selectedProject.description}</p>
              </div>
              <div>
                <p className="text-sm text-blue-600">Status</p>
                <Badge className="bg-green-500/20 text-green-600">{selectedProject.status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 backdrop-blur-sm border-indigo-500/20">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-indigo-600" />
              <span>Test Case Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-indigo-600">Test Case Name</p>
                <p className="text-gray-900 font-medium">{selectedTestCase.name}</p>
              </div>
              <div>
                <p className="text-sm text-indigo-600">Description</p>
                <p className="text-gray-900">{selectedTestCase.description}</p>
              </div>
              <div>
                <p className="text-sm text-indigo-600">Priority</p>
                <Badge className="bg-yellow-500/20 text-yellow-600">{selectedTestCase.priority}</Badge>
              </div>
              <div>
                <p className="text-sm text-indigo-600">Total Steps</p>
                <p className="text-gray-900 font-bold text-lg">{testSteps.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Database Configuration */}
      <Card className="bg-gradient-to-r from-green-500/10 to-blue-500/10 backdrop-blur-sm border-green-500/20">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center space-x-2">
            <Database className="w-5 h-5 text-green-600" />
            <span>Database Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-green-600">Server</p>
              <p className="text-gray-900 font-mono">LPT2084-B1</p>
            </div>
            <div>
              <p className="text-green-600">Database</p>
              <p className="text-gray-900 font-mono">Ixigo_TestAutomation</p>
            </div>
            <div>
              <p className="text-green-600">Test Table</p>
              <p className="text-gray-900 font-mono">{selectedTestCase.name.replace(' ', '_').replace('-', '_')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Steps Preview */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Configured Test Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {(!testSteps || testSteps.length === 0) ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
              <p className="text-yellow-600 text-lg">No test steps configured</p>
              <p className="text-gray-600 text-sm">Please go back and add some test steps</p>
              <p className="text-red-600 text-xs mt-2">Debug: testSteps = {JSON.stringify(testSteps)}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {testSteps.map((step, index) => (
                <div key={step.id} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {step.step_no}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">{step.test_step_description}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge className="bg-blue-500/20 text-blue-600 text-xs">{step.action_type}</Badge>
                      <span className="text-gray-600 text-xs">{step.element_name}</span>
                      {step.values && <span className="text-green-600 text-xs">→ {step.values}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
        </CardContent>
      </Card>

      {/* Execution Section */}
      {isExecuting && (
        <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 backdrop-blur-sm border-orange-500/20">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-orange-600 animate-spin" />
              <span>Real Test Execution in Progress</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${executionProgress}%` }}
                ></div>
              </div>
              <p className="text-center text-gray-900">{executionProgress}% Complete</p>
              
              {/* Execution Logs */}
              <div className="bg-gray-100 rounded-lg p-4 max-h-48 overflow-y-auto">
                <h4 className="text-gray-900 font-medium mb-2">Live Execution Logs:</h4>
                {executionLogs.map((log, index) => (
                  <p key={index} className="text-sm text-gray-700 font-mono mb-1">{log}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-end items-center">
        <Button 
          onClick={handleExecuteTests}
          disabled={isExecuting || !testSteps || testSteps.length === 0}
          className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
        >
          <Play className="w-4 h-4 mr-2" />
          {isExecuting ? 'Executing Real Tests...' : 'Execute'}
        </Button>
      </div>
    </div>
  );
};

export default TestSummaryDashboard;
