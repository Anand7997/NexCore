// File: src/components/TestResultsDashboard.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, Download, RefreshCw, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/useAuthorization';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import PageBackButton from '@/components/ui/page-back-button';

interface StepResult {
    tc_id: string;
    step_no: number;
    test_step_description: string;
    element_name: string;
    action_type: string;
    xpath: string;
    values: string;
    status: 'PASS' | 'FAIL';
    error?: string;
    before_screenshot?: string;
    after_screenshot?: string;
    screenshot_status?: 'success' | 'error' | 'timeout';
    secondary_action?: string;
    secondary_value?: string;
    secondary_status?: 'PASS' | 'FAIL' | 'SKIPPED';
    secondary_error?: string;
    secondary_screenshot?: string;
}

interface TestResult {
    id: number;
    testcase_id: string;
    testrun_id: string;
    result_id: string;
    testcase_name: string;
    tc_id: string;
    test_mode: string;
    status: 'PASS' | 'PARTIAL_PASS' | 'FAIL';
    total_steps: number;
    passed_steps: number;
    failed_steps: number;
    execution_time: string;
    test_data: string;
    step_results: StepResult[]; // Changed from string to StepResult[]
    step_details?: StepResult[]; // Alias for compatibility
    error_message: string;
    execution_date: string;
    start_time?: string;
    end_time?: string;
    browser_info?: string;
    page?: string;
    execution_mode?: string;
    agentid?: string;
    username?: string;
    role?: string;
}

interface TestResultsDashboardProps {
    selectedTestCase: any;
    onBack: () => void;
}

const TestResultsDashboard: React.FC<TestResultsDashboardProps> = ({
    selectedTestCase,
    onBack
}) => {
    const [testResults, setTestResults] = useState<TestResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [allureStatus, setAllureStatus] = useState<{available: boolean, report_ready: boolean, report_url?: string}>({available: false, report_ready: false});
    const isMountedRef = useRef(true);

    // Check authorization for reporting function
    const { authorized, loading: authLoading, error: authError } = useAuthorization('reporting');

    const { toast } = useToast();

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const checkAllureStatus = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        try {
            const response = await fetch(buildApiUrl('/api/allure/status'));
            if (response.ok && isMountedRef.current) {
                const status = await response.json();
                setAllureStatus(status);
            }
        } catch (error) {
            console.error('Failed to check Allure status:', error);
        }
    }, []);

    const loadTestResults = useCallback(async () => {
        if (!isMountedRef.current) return;
        try {
            setIsLoading(true);
            
            // If we have an execution_id, use the detailed endpoint, otherwise use the general one
            const endpoint = selectedTestCase.execution_id 
                ? `/api/execution-details/${selectedTestCase.execution_id}`
                : `/api/results/${selectedTestCase.name}`;
                
            const response = await fetch(buildApiUrl(endpoint));

            if (response.ok && isMountedRef.current) {
                const data = await response.json();
                console.log('Loaded test results:', data);

                let resultsArray = [];
                
                if (selectedTestCase.execution_id) {
                    // Single execution details
                    resultsArray = [data];
                } else {
                    // Multiple results
                    resultsArray = Array.isArray(data) ? data : [data];
                }

                // Parse step_details if it's still a string from the backend
                const parsedData = resultsArray.map((result: any) => {
                    let stepResultsParsed = result.step_details || result.step_results || [];
                    if (typeof stepResultsParsed === 'string') {
                        try {
                            stepResultsParsed = JSON.parse(stepResultsParsed);
                        } catch (parseError) {
                            console.error('Failed to parse step_details JSON:', parseError, 'Raw data:', stepResultsParsed);
                            stepResultsParsed = [];
                        }
                    }
                    return {
                        ...result,
                        step_results: stepResultsParsed
                    };
                });

                if (isMountedRef.current) {
                    setTestResults(parsedData);
                }
            } else if (isMountedRef.current) {
                console.error('Failed to load test results');
                setTestResults([]);
                toast({
                    title: "No Results Found",
                    description: "No test execution results found for this test case",
                    variant: "destructive"
                });
            }
        } catch (error) {
            if (isMountedRef.current) {
                console.error('Error loading test results:', error);
                setTestResults([]);
                toast({
                    title: "Error",
                    description: "Failed to load test results",
                    variant: "destructive"
                });
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [selectedTestCase?.name, selectedTestCase?.execution_id, toast]);

    // Load test results when component mounts or selectedTestCase changes
    useEffect(() => {
        if (selectedTestCase?.name || selectedTestCase?.execution_id) {
            loadTestResults();
            checkAllureStatus();
        }
    }, [selectedTestCase?.name, selectedTestCase?.execution_id, loadTestResults, checkAllureStatus]);

    const calculateSummary = () => {
        const totalTests = testResults.length;
        const passedTests = testResults.filter(r => r.status === 'PASS').length;
        const partialTests = testResults.filter(r => r.status === 'PARTIAL_PASS').length;
        const failedTests = testResults.filter(r => r.status === 'FAIL').length;
        const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

        return { totalTests, passedTests, partialTests, failedTests, passRate };
    };

    const summary = calculateSummary();

    const openScreenshot = (screenshotPath?: string) => {
        if (!screenshotPath) return;
        const isFullPath = screenshotPath.includes('/') || screenshotPath.includes('\\');
        const url = isFullPath
            ? screenshotPath
            : buildApiUrl(`/allure-results/${screenshotPath}`);
        window.open(url, '_blank');
    };

    const handleExportResults = () => {
        toast({
            title: "Export Started",
            description: "Test results are being exported to CSV...",
        });
        // TODO: Implement actual export functionality
    };

    const handleRerunTests = async () => {
        if (!selectedTestCase?.name) {
            toast({
                title: "Error",
                description: "No test case selected for re-execution",
                variant: "destructive"
            });
            return;
        }

        try {
            toast({
                title: "Test Re-execution",
                description: "Starting test re-execution...",
            });

            // Get current user email from localStorage
            const savedUser = localStorage.getItem('qfast_user');
            const userEmail = savedUser ? JSON.parse(savedUser).email : null;

            const response = await fetch(buildApiUrl(`/api/execute/${selectedTestCase.name}`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(userEmail && { 'X-User-Email': userEmail }),
                },
                body: JSON.stringify({
                    suite_type: selectedTestCase.test_mode || 'regression'  // Use test_mode from the test case or default to regression
                })
            });

            if (response.ok) {
                const result = await response.json();
                toast({
                    title: "Test Execution",
                    description: `Test execution completed successfully. Status: ${result.overall_status || 'Unknown'}`,
                });
                
                // Refresh results after execution
                setTimeout(() => {
                    if (isMountedRef.current) {
                        loadTestResults();
                    }
                }, 2000);
            } else {
                const error = await response.json();
                toast({
                    title: "Execution Failed",
                    description: error.error || "Failed to execute test case",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error executing test:', error);
            toast({
                title: "Execution Error",
                description: "An error occurred while executing the test",
                variant: "destructive"
            });
        }
    };

    const handleRefreshResults = () => {
        loadTestResults();
        toast({
            title: "Refreshing",
            description: "Loading latest test results...",
        });
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

    if (isLoading) {
        return (
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardContent className="p-8 text-center">
                    <div className="flex items-center justify-center space-x-2 text-gray-600">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Loading test results...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <PageBackButton onClick={onBack} label="Back to Summary" />

            {/* Header Section */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl text-gray-900 flex items-center space-x-2">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                                <span>Test Results Dashboard</span>
                            </CardTitle>
                            <p className="text-gray-600 mt-2">View detailed test execution results and analytics</p>
                        </div>
                        <div className="flex space-x-2">
                            {allureStatus.report_ready && (
                                <Button 
                                    onClick={() => window.open(allureStatus.report_url, '_blank')} 
                                    variant="outline" 
                                    className="border-purple-500/20 text-purple-600 hover:bg-purple-50"
                                >
                                    <BarChart3 className="w-4 h-4 mr-2" />
                                    View Allure Report
                                </Button>
                            )}
                            <Button onClick={handleRefreshResults} variant="outline" className="border-green-500/20 text-green-600">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Refresh Results
                            </Button>
                            <Button onClick={handleExportResults} variant="outline" className="border-gray-200 text-gray-600">
                                <Download className="w-4 h-4 mr-2" />
                                Export Results
                            </Button>
                            <Button onClick={handleRerunTests} className="bg-blue-500 hover:bg-blue-600">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Re-run Tests
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 backdrop-blur-sm border-blue-500/20">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-blue-600 text-sm">Total Tests</p>
                                <p className="text-2xl font-bold text-gray-900">{summary.totalTests}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                                <Clock className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 backdrop-blur-sm border-green-500/20">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-green-600 text-sm">Passed</p>
                                <p className="text-2xl font-bold text-gray-900">{summary.passedTests}</p>
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
                                <p className="text-2xl font-bold text-gray-900">{summary.failedTests}</p>
                            </div>
                            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                                <XCircle className="w-6 h-6 text-red-600" />
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
                                <AlertTriangle className="w-6 h-6 text-indigo-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className={`bg-gradient-to-br backdrop-blur-sm ${allureStatus.report_ready ? 'from-purple-500/10 to-purple-600/10 border-purple-500/20' : 'from-gray-500/10 to-gray-600/10 border-gray-500/20'}`}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-sm ${allureStatus.report_ready ? 'text-purple-600' : 'text-gray-600'}`}>Allure Report</p>
                                <p className="text-2xl font-bold text-gray-900">{allureStatus.report_ready ? 'Ready' : 'N/A'}</p>
                            </div>
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${allureStatus.report_ready ? 'bg-purple-500/20' : 'bg-gray-500/20'}`}>
                                <BarChart3 className={`w-6 h-6 ${allureStatus.report_ready ? 'text-purple-600' : 'text-gray-600'}`} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Pass Rate Progress */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-gray-900">Overall Test Pass Rate</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Success Rate</span>
                            <span className="text-gray-900">{summary.passRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={summary.passRate} className="h-2" />
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Step Results Table */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-gray-900">Detailed Step Results</CardTitle>
                    <p className="text-gray-600 text-sm">Step-by-step execution details from latest test run</p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-2 text-gray-600">TC_ID</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Step_No</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Test_Step_Description</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Element_Name</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Action_Type</th>
                                    <th className="text-left py-3 px-2 text-gray-600">XPath</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Values</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Screenshots</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Pass/Fail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {testResults.length > 0 && testResults[0].step_results && testResults[0].step_results.length > 0 ? (
                                    testResults[0].step_results.map((step, index) => (
                                        <tr key={index} className={`border-b border-gray-100 hover:bg-gray-50 ${
                                            step.status === 'FAIL' ? 'bg-red-50 border-red-200' : ''
                                        }`}>
                                            <td className="py-3 px-2 text-gray-900">{step.tc_id}</td>
                                            <td className="py-3 px-2 text-gray-900">{step.step_no}</td>
                                            <td className="py-3 px-2 text-gray-900 max-w-xs">
                                                <div className="truncate" title={step.test_step_description}>
                                                    {step.test_step_description}
                                                </div>
                                            </td>
                                            <td className={`py-3 px-2 max-w-xs ${
                                                step.status === 'FAIL' ? 'text-red-600 font-semibold' : 'text-gray-900'
                                            }`}>
                                                <div className={`truncate ${
                                                    step.status === 'FAIL' ? 'bg-red-100 px-2 py-1 rounded border border-red-300' : ''
                                                }`} title={step.element_name}>
                                                    {step.element_name}
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-gray-900">{step.action_type}</td>
                                            <td className={`py-3 px-2 max-w-xs ${
                                                step.status === 'FAIL' ? 'text-red-600' : 'text-gray-600'
                                            }`}>
                                                <div className={`truncate font-mono text-xs ${
                                                    step.status === 'FAIL' ? 'bg-red-100 px-2 py-1 rounded border border-red-300' : ''
                                                }`} title={step.xpath}>
                                                    {step.xpath}
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-gray-900 max-w-xs">
                                                <div className="truncate" title={step.values}>
                                                    {step.values === 'N/A' ? '-' : step.values}
                                                </div>
                                            </td>
                                            <td className="py-3 px-2">
                                                <div className="flex flex-col items-start space-y-1">
                                                    {step.after_screenshot && (
                                                        <button
                                                            onClick={() => openScreenshot(step.after_screenshot)}
                                                            className={`text-xs px-2 py-1 rounded transition-colors ${
                                                                step.status === 'FAIL'
                                                                    ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30'
                                                                    : 'bg-slate-500/20 text-slate-700 hover:bg-slate-500/30'
                                                            }`}
                                                            title={step.status === 'FAIL' ? 'View Failure Screenshot' : 'View Step Screenshot'}
                                                        >
                                                            {step.status === 'FAIL' ? 'Failure Screenshot' : 'Step Screenshot'}
                                                        </button>
                                                    )}
                                                    {step.secondary_screenshot && (
                                                        <button
                                                            onClick={() => openScreenshot(step.secondary_screenshot)}
                                                            className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 rounded hover:bg-blue-500/30 transition-colors"
                                                            title="View Secondary Action Screenshot"
                                                        >
                                                            Secondary Screenshot
                                                        </button>
                                                    )}
                                                    {!step.after_screenshot && !step.secondary_screenshot && (
                                                        <span className="text-gray-400 text-xs">No screenshots</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-2">
                                                <div className="flex flex-col items-start space-y-1">
                                                    <Badge className={
                                                        step.status === 'PASS'
                                                            ? 'bg-green-500/20 text-green-600'
                                                            : 'bg-red-500/20 text-red-600'
                                                    }>
                                                        {step.status}
                                                    </Badge>
                                                    {step.secondary_action && (
                                                        <Badge className={
                                                            step.secondary_status === 'FAIL'
                                                                ? 'bg-orange-500/20 text-orange-700'
                                                                : step.secondary_status === 'PASS'
                                                                    ? 'bg-blue-500/20 text-blue-700'
                                                                    : 'bg-slate-500/20 text-slate-700'
                                                        }>
                                                            {`${step.secondary_action}${step.secondary_status ? `: ${step.secondary_status}` : ''}`}
                                                        </Badge>
                                                    )}
                                                    {step.error && (
                                                        <span className="text-red-600 text-xs italic truncate max-w-xs" title={step.error}>
                                                            {step.error}
                                                        </span>
                                                    )}
                                                    {step.secondary_error && (
                                                        <span className="text-orange-700 text-xs italic truncate max-w-xs" title={step.secondary_error}>
                                                            {step.secondary_error}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="py-8 px-4 text-center text-gray-600">
                                            No step results available. Run a test to see detailed step-by-step results.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Execution Summary Table */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-gray-900">Execution History</CardTitle>
                    <p className="text-gray-600 text-sm">All test execution results stored in {selectedTestCase?.name}_Results table</p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-2 text-gray-600">Test Case ID</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Test Run ID</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Result ID</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Execution Mode</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Status</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Steps</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Duration</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Execution Date</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Agent ID</th>
                                    <th className="text-left py-3 px-2 text-gray-600">User</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Role</th>
                                    <th className="text-left py-3 px-2 text-gray-600">Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {testResults.map((result) => (
                                    <tr key={result.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-3 px-2">
                                            <div className="bg-blue-50 p-2 rounded border border-blue-200">
                                                <span className="text-xs font-medium text-blue-700">TC ID:</span>
                                                <div className="font-mono text-sm text-blue-900">{result.testcase_id || 'N/A'}</div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2">
                                            <div className="bg-green-50 p-2 rounded border border-green-200">
                                                <span className="text-xs font-medium text-green-700">TR ID:</span>
                                                <div className="font-mono text-sm text-green-900">{result.testrun_id || 'N/A'}</div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2">
                                            <div className="bg-purple-50 p-2 rounded border border-purple-200">
                                                <span className="text-xs font-medium text-purple-700">Result:</span>
                                                <div className="font-mono text-sm text-purple-900">{result.result_id || 'N/A'}</div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2">
                                            <Badge className={
                                                result.execution_mode === 'agent'
                                                    ? 'bg-blue-500/20 text-blue-600'
                                                    : 'bg-gray-500/20 text-gray-600'
                                            }>
                                                {result.execution_mode === 'agent' ? 'Local Agent' : 'Server'}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-2">
                                            <Badge className={
                                                result.status === 'PASS'
                                                    ? 'bg-green-500/20 text-green-600'
                                                    : result.status === 'PARTIAL_PASS'
                                                        ? 'bg-orange-500/20 text-orange-700'
                                                        : 'bg-red-500/20 text-red-600'
                                            }>
                                                {result.status === 'PARTIAL_PASS' ? 'PARTIAL PASS' : result.status}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-2 text-gray-900">
                                            <div className="flex items-center space-x-1">
                                                <span className="text-green-600">{result.passed_steps}</span>
                                                <span className="text-gray-600">/</span>
                                                <span className="text-gray-900">{result.total_steps}</span>
                                                {result.failed_steps > 0 && (
                                                    <>
                                                        <span className="text-gray-600">|</span>
                                                        <span className="text-red-600">{result.failed_steps} failed</span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-2 text-gray-900">{result.execution_time}</td>
                                        <td className="py-3 px-2 text-gray-900">
                                            {(() => {
                                                const dateStr = result.execution_date;
                                                try {
                                                  
                                                  if (!dateStr) return 'N/A';
                                                  
                                                  // Handle different date formats more reliably
                                                  let date;
                                                  
                                                  if (typeof dateStr === 'string') {
                                                    // Fix for server execution: backend strips 'Z' from UTC timestamps
                                                    // If it looks like an ISO string without timezone, treat as UTC from server
                                                    if (dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-')) {
                                                      // This is likely a server execution timestamp that had 'Z' stripped
                                                      // Add 'Z' back to indicate UTC for server execution
                                                      if (result.execution_mode !== 'agent') {
                                                        date = new Date(dateStr + 'Z');
                                                      } else {
                                                        // Local agent execution - treat as local time
                                                        date = new Date(dateStr);
                                                      }
                                                    } else if (dateStr.includes('T') || dateStr.includes('Z')) {
                                                      // Already has timezone info
                                                      date = new Date(dateStr);
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
                                                    
                                                    // Check if the date is valid
                                                    if (isNaN(date.getTime())) {
                                                      throw new Error('Invalid date format');
                                                    }
                                                  } else {
                                                    date = new Date(dateStr);
                                                  }
                                                  
                                                  // Format to local time in en-IN format with execution mode indicator
                                                  const formattedDate = date.toLocaleString('en-IN', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                    hour12: false
                                                  });
                                                  
                                                  // Add execution mode indicator for debugging
                                                  const modeIndicator = result.execution_mode === 'agent' ? ' (L)' : ' (S)';
                                                  return formattedDate + modeIndicator;
                                                } catch (error) {
                                                  console.error('Date formatting error:', error, 'Date string:', dateStr, 'Execution mode:', result.execution_mode);
                                                  return formatExecutionDate(result.execution_date);
                                                }
                                            })()}
                                        </td>
                                        <td className="py-3 px-2">
                                            <div className="bg-indigo-50 p-2 rounded border border-indigo-200 max-w-xs">
                                                <span className="text-xs font-medium text-indigo-700">Agent:</span>
                                                <div className="font-mono text-sm text-indigo-900 truncate" title={result.agentid || 'N/A'}>
                                                    {result.agentid || 'N/A'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2">
                                            <div className="bg-orange-50 p-2 rounded border border-orange-200 max-w-xs">
                                                <span className="text-xs font-medium text-orange-700">User:</span>
                                                <div className="font-mono text-sm text-orange-900 truncate" title={result.username || 'N/A'}>
                                                    {result.username || 'N/A'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2">
                                            <div className="bg-teal-50 p-2 rounded border border-teal-200 max-w-xs">
                                                <span className="text-xs font-medium text-teal-700">Role:</span>
                                                <div className="font-mono text-sm text-teal-900 truncate" title={result.role || 'N/A'}>
                                                    {result.role || 'N/A'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2 text-red-600 max-w-xs truncate">
                                            {result.error_message || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-end items-center">
                <div className="text-sm text-gray-600">
                    Results automatically saved to database: {selectedTestCase?.name}_Results
                </div>
            </div>
        </div>
    );
};

export default TestResultsDashboard;
