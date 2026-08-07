import React, { useState, useEffect } from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, TrendingUp, TrendingDown, CheckCircle, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';
 
interface TestResult {
  uid: string;
  name: string;
  time: {
    start: number;
    stop: number;
    duration: number;
  };
  status: 'passed' | 'broken' | 'failed';
  severity: string;
}
 
interface PerformanceMetrics {
  averageDuration: number;
  totalTests: number;
  passRate: number;
  failRate: number;
  fastestTest: TestResult | null;
  slowestTest: TestResult | null;
}
 
const chartConfig = {
  duration: {
    label: "Duration (ms)",
    color: "hsl(var(--chart-1))",
  },
  passed: {
    label: "Passed",
    color: "hsl(142, 76%, 36%)",
  },
  broken: {
    label: "Broken",
    color: "hsl(0, 84%, 60%)",
  },
  failed: {
    label: "Failed",
    color: "hsl(25, 95%, 53%)",
  },
  average: {
    label: "Average",
    color: "hsl(var(--chart-2))",
  },
};
 
const COLORS = {
  passed: '#22c55e',
  broken: '#ef4444',
  failed: '#f97316',
};
 
interface PerformanceDashboardProps {
  onBack?: () => void;
}
 
export default function PerformanceDashboard({ onBack }: PerformanceDashboardProps) {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
 
  useEffect(() => {
    loadTestResults();
  }, []);
 
  const loadTestResults = async () => {
    try {
      const response = await fetch('/allure-report/widgets/duration.json');
      const data: TestResult[] = await response.json();
      setTestResults(data);
      calculateMetrics(data);
    } catch (error) {
      console.error('Failed to load test results:', error);
     
    } finally {
      setLoading(false);
    }
  };
 
  const calculateMetrics = (data: TestResult[]) => {
    if (data.length === 0) return;
 
    const totalTests = data.length;
    const passedTests = data.filter(test => test.status === 'passed').length;
    const brokenTests = data.filter(test => test.status === 'broken').length;
    const totalDuration = data.reduce((sum, test) => sum + test.time.duration, 0);
    const averageDuration = totalDuration / totalTests;
   
    const fastestTest = data.reduce((fastest, current) =>
      current.time.duration < fastest.time.duration ? current : fastest
    );
   
    const slowestTest = data.reduce((slowest, current) =>
      current.time.duration > slowest.time.duration ? current : slowest
    );
 
    setMetrics({
      averageDuration,
      totalTests,
      passRate: (passedTests / totalTests) * 100,
      failRate: ((brokenTests) / totalTests) * 100,
      fastestTest,
      slowestTest,
    });
  };
 
  const prepareTimelineData = () => {
    return testResults
      .sort((a, b) => a.time.start - b.time.start)
      .map((test, index) => ({
        index: index + 1,
        name: test.name.split('] ')[1] || test.name,
        duration: test.time.duration,
        status: test.status,
        timestamp: new Date(test.time.start).toLocaleDateString(),
      }));
  };
 
  const prepareStatusData = () => {
    const statusCounts = testResults.reduce((acc, test) => {
      acc[test.status] = (acc[test.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
 
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: ((count / testResults.length) * 100).toFixed(1),
    }));
  };
 
  const prepareTestTypeData = () => {
    const testTypes = testResults.reduce((acc, test) => {
      const testType = test.name.split('_')[1] || 'Unknown';
      if (!acc[testType]) {
        acc[testType] = { name: testType, passed: 0, broken: 0, failed: 0, avgDuration: 0, tests: [] };
      }
      acc[testType][test.status as keyof typeof acc[typeof testType]]++;
      acc[testType].tests.push(test.time.duration);
      return acc;
    }, {} as Record<string, any>);
 
    return Object.values(testTypes).map((type: any) => ({
      ...type,
      avgDuration: type.tests.reduce((sum: number, duration: number) => sum + duration, 0) / type.tests.length,
      total: type.passed + type.broken + type.failed,
    }));
  };
 
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">Loading performance data...</div>
      </div>
    );
  }
 
  if (!testResults.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">No test performance data available</div>
      </div>
    );
  }
 
  const timelineData = prepareTimelineData();
  const statusData = prepareStatusData();
  const testTypeData = prepareTestTypeData();
 
  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back" />

      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Performance Dashboard</h1>
          <p className="text-gray-600 mt-1">Analyze test execution performance and metrics</p>
        </div>
        <div />
      </div>
 
      {/* Performance Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalTests}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.passRate.toFixed(1)}% pass rate
              </p>
            </CardContent>
          </Card>
 
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(metrics.averageDuration / 1000).toFixed(1)}s</div>
              <p className="text-xs text-muted-foreground">
                Range: {(metrics.fastestTest!.time.duration / 1000).toFixed(1)}s - {(metrics.slowestTest!.time.duration / 1000).toFixed(1)}s
              </p>
            </CardContent>
          </Card>
 
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fastest Test</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {(metrics.fastestTest!.time.duration / 1000).toFixed(1)}s
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {metrics.fastestTest!.name.split('] ')[1] || metrics.fastestTest!.name}
              </p>
            </CardContent>
          </Card>
 
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Slowest Test</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {(metrics.slowestTest!.time.duration / 1000).toFixed(1)}s
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {metrics.slowestTest!.name.split('] ')[1] || metrics.slowestTest!.name}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
 
      {/* Charts */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="status">Status Distribution</TabsTrigger>
          <TabsTrigger value="comparison">Test Type Comparison</TabsTrigger>
          <TabsTrigger value="trends">Duration Trends</TabsTrigger>
        </TabsList>
 
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Execution Timeline</CardTitle>
              <CardDescription>
                Duration of each test execution over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[400px]">
                <AreaChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value, name) => [
                      `${(value as number / 1000).toFixed(1)}s`,
                      'Duration'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="duration"
                    stroke="var(--color-duration)"
                    fill="var(--color-duration)"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
 
        <TabsContent value="status" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Test Status Distribution</CardTitle>
                <CardDescription>Overall test results breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ status, percentage }) => `${status}: ${percentage}%`}
                    >
                      {statusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[entry.status as keyof typeof COLORS]}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
 
            <Card>
              <CardHeader>
                <CardTitle>Status Summary</CardTitle>
                <CardDescription>Detailed breakdown of test results</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {statusData.map((status) => (
                  <div key={status.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {status.status === 'passed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {status.status === 'broken' && <XCircle className="h-4 w-4 text-red-500" />}
                      {status.status === 'failed' && <AlertCircle className="h-4 w-4 text-orange-500" />}
                      <span className="capitalize">{status.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{status.count}</Badge>
                      <span className="text-sm text-muted-foreground">{status.percentage}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
 
        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Type Performance Comparison</CardTitle>
              <CardDescription>
                Average duration and success rate by test type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[400px]">
                <BarChart data={testTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value, name) => [
                      name === 'avgDuration' ? `${(value as number / 1000).toFixed(1)}s` : value,
                      name === 'avgDuration' ? 'Avg Duration' : name
                    ]}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="passed" fill="var(--color-passed)" />
                  <Bar dataKey="broken" fill="var(--color-broken)" />
                  <Bar dataKey="failed" fill="var(--color-failed)" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
 
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Duration Trends</CardTitle>
              <CardDescription>
                Test execution duration patterns and average line
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[400px]">  
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value, name) => [
                      `${(value as number / 1000).toFixed(1)}s`,
                      name === 'duration' ? 'Duration' : 'Average'
                    ]}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    type="monotone"
                    dataKey="duration"
                    stroke="var(--color-duration)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={() => metrics?.averageDuration}
                    stroke="var(--color-average)"
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}