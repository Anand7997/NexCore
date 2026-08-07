// File: src/components/RecentResults.tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import PageBackButton from '@/components/ui/page-back-button';
 
interface RecentTestResult {
    id: number;
    testcase_name: string;
    execution_id: string;
    status: 'PASS' | 'PARTIAL_PASS' | 'FAIL';
    total_steps: number;
    passed_steps: number;
    failed_steps: number;
    skipped_steps: number;
    execution_time: string;
    start_time: string;
    end_time: string;
    error_message: string;
    browser_info: string;
    created_date: string;
    page?: string;
}
 
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
    step_results: StepResult[];
    error_message: string;
    execution_date: string;
    start_time?: string;
    end_time?: string;
    browser_info?: string;
    page?: string;
}
 
interface RecentResultsProps {
    onBack: () => void;
}
 
const RecentResults: React.FC<RecentResultsProps> = ({ onBack }) => {
    const [recentResults, setRecentResults] = useState<RecentTestResult[]>([]);
    const [selectedTestResult, setSelectedTestResult] = useState<TestResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const { toast } = useToast();

    const openScreenshot = (screenshotPath?: string) => {
        if (!screenshotPath) return;
        const isFullPath = screenshotPath.includes('/') || screenshotPath.includes('\\');
        const url = isFullPath
            ? screenshotPath
            : buildApiUrl(`/allure-results/${screenshotPath}`);
        window.open(url, '_blank');
    };
 
    const fetchRecentResults = async () => {
        try {
            setLoading(true);
            const response = await fetch(buildApiUrl('/api/results'));
            if (!response.ok) {
                throw new Error('Failed to fetch recent results');
            }
            const data = await response.json();
            // Get only the last 10 results
            setRecentResults(data.slice(0, 10));
        } catch (error) {
            console.error('Error fetching recent results:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch recent test results',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };
 
    const fetchTestDetails = async (testcaseName: string) => {
        try {
            setDetailsLoading(true);
            const response = await fetch(buildApiUrl(`/api/results/${testcaseName}`));
            if (!response.ok) {
                throw new Error('Failed to fetch test details');
            }
            const data = await response.json();
            if (data.length > 0) {
                setSelectedTestResult(data[0]); // Get the most recent result
            }
        } catch (error) {
            console.error('Error fetching test details:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch test details',
                variant: 'destructive'
            });
        } finally {
            setDetailsLoading(false);
        }
    };
 
    useEffect(() => {
        fetchRecentResults();
    }, []);
 
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'PASS':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'FAIL':
                return <XCircle className="w-4 h-4 text-red-500" />;
            default:
                return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
        }
    };
 
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PASS':
                return <Badge className="bg-green-100 text-green-800 border-green-300">PASS</Badge>;
            case 'PARTIAL_PASS':
                return <Badge className="bg-orange-100 text-orange-800 border-orange-300">PARTIAL PASS</Badge>;
            case 'FAIL':
                return <Badge className="bg-red-100 text-red-800 border-red-300">FAIL</Badge>;
            default:
                return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">UNKNOWN</Badge>;
        }
    };
 

 
    const handleTestCaseClick = (testResult: RecentTestResult) => {
        fetchTestDetails(testResult.testcase_name);
    };
 
    if (selectedTestResult) {
        return (
            <div className="space-y-6">
                <PageBackButton onClick={() => setSelectedTestResult(null)} label="Back to Recent Results" />

                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold">{selectedTestResult.testcase_name} - Test Steps</h2>
                </div>
 
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg">Test Execution Details</CardTitle>
                            {getStatusBadge(selectedTestResult.status)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span className="font-medium">Test ID:</span> {selectedTestResult.tc_id}
                            </div>
                            <div>
                                <span className="font-medium">Execution Time:</span> {selectedTestResult.execution_time}
                            </div>
                            <div>
                                <span className="font-medium">Total Steps:</span> {selectedTestResult.total_steps}
                            </div>
                            <div>
                                <span className="font-medium">Date:</span> {formatExecutionDate(selectedTestResult.execution_date)}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {selectedTestResult.step_results && selectedTestResult.step_results.length > 0 ? (
                                selectedTestResult.step_results.map((step, index) => (
                                    <Card key={index} className="border-l-4 border-l-blue-500">
                                        <CardContent className="pt-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">Step {step.step_no}</span>
                                                    {getStatusIcon(step.status)}
                                                    {getStatusBadge(step.status)}
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-sm">
                                                <div>
                                                    <span className="font-medium">Description:</span> {step.test_step_description}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Action:</span> {step.action_type}
                                                </div>
                                                {step.element_name && (
                                                    <div>
                                                        <span className="font-medium">Element:</span> {step.element_name}
                                                    </div>
                                                )}
                                                {step.values && (
                                                    <div>
                                                        <span className="font-medium">Values:</span> {step.values}
                                                    </div>
                                                )}
                                                {step.error && (
                                                    <div className="text-red-600">
                                                        <span className="font-medium">Error:</span> {step.error}
                                                    </div>
                                                )}
                                                {step.secondary_action && (
                                                    <div>
                                                        <span className="font-medium">Secondary Action:</span> {step.secondary_action}
                                                        {step.secondary_status ? ` (${step.secondary_status})` : ''}
                                                    </div>
                                                )}
                                                {step.secondary_error && (
                                                    <div className="text-orange-700">
                                                        <span className="font-medium">Secondary Error:</span> {step.secondary_error}
                                                    </div>
                                                )}
                                                {(step.after_screenshot || step.secondary_screenshot) && (
                                                    <div className="flex flex-wrap gap-2 pt-2">
                                                        {step.after_screenshot && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openScreenshot(step.after_screenshot)}
                                                                className="h-8"
                                                            >
                                                                {step.status === 'FAIL' ? 'Failure Screenshot' : 'Step Screenshot'}
                                                            </Button>
                                                        )}
                                                        {step.secondary_screenshot && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openScreenshot(step.secondary_screenshot)}
                                                                className="h-8"
                                                            >
                                                                Secondary Screenshot
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    No step details available for this test case.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }
 
    return (
        <div className="space-y-6">
            <PageBackButton onClick={onBack} label="Back" />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold">Recent Test Results</h2>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchRecentResults}
                    disabled={loading}
                    className="flex items-center gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>
 
            {loading ? (
                <div className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading recent results...
                </div>
            ) : recentResults.length > 0 ? (
                <div className="space-y-4">
                    {recentResults.map((result) => (
                        <Card
                            key={result.id}
                            className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
                            onClick={() => handleTestCaseClick(result)}
                        >
                            <CardContent className="pt-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="font-medium text-lg">{result.testcase_name}</h3>
                                            {getStatusIcon(result.status)}
                                            {getStatusBadge(result.status)}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                                            <div>
                                                <span className="font-medium">Execution ID:</span> {result.execution_id}
                                            </div>
                                            <div>
                                                <span className="font-medium">Duration:</span> {result.execution_time}
                                            </div>
                                            <div>
                                                <span className="font-medium">Steps:</span> {result.total_steps}
                                                <span className="text-green-600 ml-1">({result.passed_steps} passed</span>
                                                {result.failed_steps > 0 && (
                                                    <span className="text-red-600">, {result.failed_steps} failed</span>
                                                )}
                                                <span>)</span>
                                            </div>
                                            <div>
                                                <span className="font-medium">Date:</span> {formatExecutionDate(result.created_date)}
                                            </div>
                                        </div>
                                        {result.error_message && (
                                            <div className="mt-2 text-sm text-red-600">
                                                <span className="font-medium">Error:</span> {result.error_message}
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-4">
                                        <Clock className="w-4 h-4 text-gray-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="text-center py-8">
                        <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No recent test results found.</p>
                        <p className="text-sm text-gray-400 mt-1">Run some tests to see results here.</p>
                    </CardContent>
                </Card>
            )}
 
            {detailsLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-4 rounded-lg flex items-center gap-3">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Loading test details...
                    </div>
                </div>
            )}
        </div>
    );
};
 
export default RecentResults;
