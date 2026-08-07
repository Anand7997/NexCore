import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PhaseStepCard from '@/components/ui/phase-step-card';
import {
  AlertTriangle,
  CheckCircle,
  Activity,
  Server,
  Database,
  Shield,
  Zap,
  Clock,
  RefreshCw,
  Bug,
  Trash2,
  Download,
  Upload,
  Settings,
  TrendingUp,
  AlertCircle,
  Wifi,
  HardDrive,
  Cpu,
  Monitor,
  FileText,
  Calendar,
  BarChart3,
  GitBranch,
  Layers,
  Eye,
  RotateCcw,
  DownloadCloud,
  UploadCloud,
  Lock,
  Unlock,
  Play,
  Pause,
  Info,
  XCircle,
  Plus,
  Loader2,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';

// Types for real data from backend
interface SystemMetrics {
  cpu: { usage: number; cores: number; status: 'healthy' | 'warning' | 'critical' };
  memory: { usage: number; total_gb: number; available_gb: number; status: 'healthy' | 'warning' | 'critical' };
  disk: { usage: number; total_gb: number; free_gb: number; status: 'healthy' | 'warning' | 'critical' };
  network: { bytes_sent: number; bytes_recv: number; packets_sent: number; packets_recv: number; status: 'healthy' | 'warning' | 'critical' };
  database: { status: 'healthy' | 'warning' | 'critical'; connections: number; avg_response: number };
}

interface BrowserDriverInfo {
  drivers: Array<{
    name: string;
    version: string;
    path?: string;
    status: 'available' | 'not_found' | 'not_installed';
    is_latest?: boolean;
  }>;
  browsers: Array<{
    name: string;
    version: string;
    path: string;
    status: 'installed';
  }>;
}

interface TestSuiteMetrics {
  suites: Array<{
    name: string;
    total_files: number;
    json_files: number;
    last_modified: string;
    directory: string;
  }>;
  total_tests: number;
  total_passed: number;
  total_failed: number;
  pass_rate: number;
  health_status: 'healthy' | 'warning' | 'critical' | 'unknown';
  last_execution: string | null;
}

interface TestDataStats {
  sizes: {
    test_results: number;
    screenshots: number;
    reports: number;
    logs: number;
  };
  total_size_gb: number;
  oldest_file: {
    file: string;
    age_days: number;
    last_modified: string;
  } | null;
  cleanup_recommendations: Array<{
    type: string;
    priority: string;
    description: string;
    action: string;
  }>;
}

interface SecurityStatus {
  ssl_certificates: {
    valid: boolean;
    expiry_days: number;
    issuer: string;
  };
  dependencies: {
    vulnerabilities: number;
    outdated_packages: number;
    last_scan: string;
  };
  file_permissions: {
    issues: number;
    sensitive_files: string[];
    last_check: string;
  };
  recent_logins: Array<{
    timestamp: string;
    status: string;
    user: string;
  }>;
  system_updates: {
    available: boolean;
    security_updates: number;
    last_check: string;
  };
  security_score: number;
  overall_status: 'secure' | 'needs_attention' | 'critical';
}

interface MaintenanceTasksData {
  tasks: Array<{
    id: number;
    name: string;
    status: 'completed' | 'running' | 'pending' | 'failed';
    priority: 'high' | 'medium' | 'low';
    scheduled: string;
    executed: string | null;
    description: string;
    created_at: string;
  }>;
  suggestions: Array<{
    type: string;
    title: string;
    description: string;
    action: string;
  }>;
  pending_count: number;
  completed_count: number;
  failed_count: number;
}

// API functions for real data fetching
const fetchSystemMetrics = async (): Promise<SystemMetrics | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/system/metrics'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    return null;
  }
};

const fetchBrowserDrivers = async (): Promise<BrowserDriverInfo | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/system/drivers'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching browser drivers:', error);
    return null;
  }
};

const fetchTestSuites = async (): Promise<TestSuiteMetrics | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/system/test-suites'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching test suites:', error);
    return null;
  }
};

const fetchTestDataStats = async (): Promise<TestDataStats | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/system/test-data'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching test data stats:', error);
    return null;
  }
};

const fetchSecurityStatus = async (): Promise<SecurityStatus | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/system/security'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching security status:', error);
    return null;
  }
};

const fetchMaintenanceTasks = async (): Promise<MaintenanceTasksData | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/maintenance/tasks'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching maintenance tasks:', error);
    return null;
  }
};

// Custom hook for data fetching
const useApiData = <T,>(fetchFunction: () => Promise<T | null>, deps: any[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFunction();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};

export function MaintenanceDashboard() {
  const [currentPage, setCurrentPage] = useState<'overview' | 'system' | 'assets' | 'performance' | 'security' | 'tasks'>('overview');
  
  // Real data fetching hooks
  const { data: systemMetrics, loading: systemLoading, error: systemError, refetch: refetchSystem } = useApiData<SystemMetrics>(fetchSystemMetrics);
  const { data: testSuites, loading: testSuitesLoading, error: testSuitesError, refetch: refetchTestSuites } = useApiData<TestSuiteMetrics>(fetchTestSuites);
  const { data: maintenanceTasksData, loading: tasksLoading, error: tasksError, refetch: refetchTasks } = useApiData<MaintenanceTasksData>(fetchMaintenanceTasks);
  const { data: browserDrivers, loading: driversLoading, error: driversError, refetch: refetchDrivers } = useApiData<BrowserDriverInfo>(fetchBrowserDrivers);
  const { data: testDataStats, loading: testDataLoading, error: testDataError, refetch: refetchTestData } = useApiData<TestDataStats>(fetchTestDataStats);
  const { data: securityStatus, loading: securityLoading, error: securityError, refetch: refetchSecurity } = useApiData<SecurityStatus>(fetchSecurityStatus);
  
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh system metrics every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchSystem();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetchSystem]);

  const refreshAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchSystem(),
        refetchTestSuites(),
        refetchTasks(),
        refetchDrivers(),
        refetchTestData(),
        refetchSecurity()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Info className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSecurityAlerts = (securityStatus: SecurityStatus | null) => {
    if (!securityStatus) return [];
    
    const alerts = [];
    if (securityStatus.dependencies.vulnerabilities > 0) {
      alerts.push({
        id: 1,
        type: 'warning' as const,
        message: `${securityStatus.dependencies.vulnerabilities} dependency vulnerabilities found`,
        timestamp: securityStatus.dependencies.last_scan,
        component: 'Security'
      });
    }
    if (securityStatus.file_permissions.issues > 0) {
      alerts.push({
        id: 2,
        type: 'warning' as const,
        message: `${securityStatus.file_permissions.issues} file permission issues detected`,
        timestamp: securityStatus.file_permissions.last_check,
        component: 'Security'
      });
    }
    return alerts;
  };

  const systemAlerts = getSecurityAlerts(securityStatus);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 p-6 text-foreground dark:[&_.bg-white]:bg-card dark:[&_.bg-gray-50]:bg-muted/40 dark:[&_.bg-gray-200]:bg-muted dark:[&_.text-gray-900]:text-foreground dark:[&_.text-gray-600]:text-muted-foreground dark:[&_.text-gray-500]:text-muted-foreground dark:[&_.text-gray-400]:text-muted-foreground/80 dark:[&_.border-gray-200]:border-border dark:[&_.border-blue-200]:border-blue-500/30 dark:[&_.border-green-200]:border-green-500/30 dark:[&_.border-yellow-200]:border-yellow-500/30 dark:[&_.border-purple-200]:border-purple-500/30 dark:[&_.border-red-200]:border-red-500/30 dark:[&_.border-orange-200]:border-orange-500/30 dark:[&_.from-gray-50]:from-card dark:[&_.to-gray-100]:to-muted/30 dark:[&_.from-blue-50]:from-blue-950/30 dark:[&_.to-indigo-50]:to-indigo-950/20 dark:[&_.from-green-50]:from-green-950/25 dark:[&_.to-emerald-50]:to-emerald-950/20 dark:[&_.from-yellow-50]:from-yellow-950/25 dark:[&_.to-orange-50]:to-orange-950/20 dark:[&_.from-purple-50]:from-purple-950/25 dark:[&_.to-violet-50]:to-violet-950/20 dark:[&_.to-pink-50]:to-pink-950/20 dark:[&_.from-red-50]:from-red-950/25 dark:[&_.to-cyan-50]:to-cyan-950/20">
      <div className="max-w-7xl mx-auto space-y-6">
        {currentPage !== 'overview' && (
          <PageBackButton onClick={() => setCurrentPage('overview')} label="Back to Overview" />
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Maintenance Dashboard</h1>
              <p className="text-gray-600 mt-1">Monitor and maintain your automation framework with real system data</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={refreshAllData}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh All</span>
            </Button>
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="rounded-lg border border-border bg-card shadow">
          {/* Overview Page - Block-based Navigation */}
          {currentPage === 'overview' && (
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Maintenance Dashboard Overview</h2>
              <p className="text-gray-600 mb-8">Select a maintenance area to monitor and manage</p>
              
              {/* Quick Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">System Health</p>
                        {systemLoading ? (
                          <p className="text-sm font-bold text-gray-400">Loading...</p>
                        ) : systemError ? (
                          <p className="text-sm font-bold text-red-500">Error</p>
                        ) : systemMetrics ? (
                          <p className={`text-2xl font-bold ${
                            systemMetrics.cpu.status === 'healthy' ? 'text-green-600' :
                            systemMetrics.cpu.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {systemMetrics.cpu.status.charAt(0).toUpperCase() + systemMetrics.cpu.status.slice(1)}
                          </p>
                        ) : (
                          <p className="text-sm font-bold text-gray-400">No Data</p>
                        )}
                      </div>
                      <Activity className="w-8 h-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Active Alerts</p>
                        {securityLoading ? (
                          <p className="text-sm font-bold text-gray-400">Loading...</p>
                        ) : securityError ? (
                          <p className="text-sm font-bold text-red-500">Error</p>
                        ) : (
                          <p className="text-2xl font-bold text-yellow-600">{systemAlerts.length}</p>
                        )}
                      </div>
                      <AlertTriangle className="w-8 h-8 text-yellow-600" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Test Suites</p>
                        {testSuitesLoading ? (
                          <p className="text-sm font-bold text-gray-400">Loading...</p>
                        ) : testSuitesError ? (
                          <p className="text-sm font-bold text-red-500">Error</p>
                        ) : testSuites ? (
                          <p className="text-2xl font-bold text-blue-600">{testSuites.suites.length}</p>
                        ) : (
                          <p className="text-sm font-bold text-gray-400">No Data</p>
                        )}
                      </div>
                      <FileText className="w-8 h-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Pending Tasks</p>
                        {tasksLoading ? (
                          <p className="text-sm font-bold text-gray-400">Loading...</p>
                        ) : tasksError ? (
                          <p className="text-sm font-bold text-red-500">Error</p>
                        ) : maintenanceTasksData ? (
                          <p className="text-2xl font-bold text-purple-600">{maintenanceTasksData.pending_count}</p>
                        ) : (
                          <p className="text-sm font-bold text-gray-400">No Data</p>
                        )}
                      </div>
                      <Clock className="w-8 h-8 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Navigation Blocks */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <PhaseStepCard
                  icon={Monitor}
                  title="System Health"
                  description="CPU, Memory, Database & Network monitoring"
                  step="Step 1"
                  accent="blue"
                  onClick={() => setCurrentPage('system')}
                >
                  <div className="flex items-center space-x-2">
                    {systemLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : systemError ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : systemMetrics ? (
                      <>
                        <Badge variant={systemMetrics.cpu.status === 'healthy' ? 'default' : 'secondary'}>
                          CPU: {systemMetrics.cpu.usage}%
                        </Badge>
                        <Badge variant={systemMetrics.memory.status === 'healthy' ? 'default' : 'secondary'}>
                          RAM: {systemMetrics.memory.usage}%
                        </Badge>
                      </>
                    ) : (
                      <Badge variant="outline">No Data</Badge>
                    )}
                  </div>
                </PhaseStepCard>

                <PhaseStepCard
                  icon={Layers}
                  title="Assets & Resources"
                  description="Browser drivers, test data & cleanup management"
                  step="Step 2"
                  accent="purple"
                  onClick={() => setCurrentPage('assets')}
                >
                  <div className="flex items-center space-x-2">
                    {driversLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    ) : driversError ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : browserDrivers ? (
                      <Badge variant="default">
                        {browserDrivers.drivers.filter(d => d.status === 'available').length} Drivers Active
                      </Badge>
                    ) : (
                      <Badge variant="outline">No Data</Badge>
                    )}
                  </div>
                </PhaseStepCard>

                <PhaseStepCard
                  icon={TrendingUp}
                  title="Performance Analytics"
                  description="Test execution metrics & optimization insights"
                  step="Step 3"
                  accent="emerald"
                  onClick={() => setCurrentPage('performance')}
                >
                  <div className="flex items-center space-x-2">
                    {testSuitesLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                    ) : testSuitesError ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : testSuites ? (
                      <Badge variant={testSuites.pass_rate >= 95 ? 'default' : testSuites.pass_rate >= 80 ? 'secondary' : 'destructive'}>
                        {testSuites.pass_rate}% Pass Rate
                      </Badge>
                    ) : (
                      <Badge variant="outline">No Data</Badge>
                    )}
                  </div>
                </PhaseStepCard>

                <PhaseStepCard
                  icon={Shield}
                  title="Security & Compliance"
                  description="SSL certificates, dependencies & access control"
                  step="Step 4"
                  accent="red"
                  onClick={() => setCurrentPage('security')}
                >
                  <div className="flex items-center space-x-2">
                    {securityLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                    ) : securityError ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : securityStatus ? (
                      <Badge variant={securityStatus.security_score >= 90 ? 'default' : securityStatus.security_score >= 70 ? 'secondary' : 'destructive'}>
                        Score: {securityStatus.security_score}/100
                      </Badge>
                    ) : (
                      <Badge variant="outline">No Data</Badge>
                    )}
                  </div>
                </PhaseStepCard>

                <PhaseStepCard
                  icon={Calendar}
                  title="Maintenance Tasks"
                  description="Scheduled tasks, automation & recommendations"
                  step="Step 5"
                  accent="orange"
                  onClick={() => setCurrentPage('tasks')}
                >
                  <div className="flex items-center space-x-2">
                          {tasksLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                          ) : tasksError ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                          ) : maintenanceTasksData ? (
                            <>
                              <Badge variant="default">
                                {maintenanceTasksData.pending_count} Pending
                              </Badge>
                              <Badge variant="secondary">
                                {maintenanceTasksData.completed_count} Completed
                              </Badge>
                            </>
                          ) : (
                            <Badge variant="outline">No Data</Badge>
                          )}
                  </div>
                </PhaseStepCard>
              </div>
            </div>
          )}

          {/* System Health Detailed View */}
          {currentPage === 'system' && (
            <div className="p-8">
              <div className="flex items-center space-x-2 mb-6">
                <Monitor className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">System Health Monitoring</h2>
              </div>
              <p className="text-gray-600 mb-8">Real-time system performance and resource usage</p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Cpu className="w-5 h-5" />
                      <span>CPU & Memory</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">CPU Usage</span>
                        {systemLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : systemError ? (
                          <span className="text-sm text-red-500">Error</span>
                        ) : systemMetrics ? (
                          <span className="text-sm font-medium">{systemMetrics.cpu.usage}%</span>
                        ) : (
                          <span className="text-sm text-gray-400">No Data</span>
                        )}
                      </div>
                      {systemMetrics && !systemLoading && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${systemMetrics.cpu.usage}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Memory Usage</span>
                        {systemLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : systemError ? (
                          <span className="text-sm text-red-500">Error</span>
                        ) : systemMetrics ? (
                          <span className="text-sm font-medium">{systemMetrics.memory.usage}%</span>
                        ) : (
                          <span className="text-sm text-gray-400">No Data</span>
                        )}
                      </div>
                      {systemMetrics && !systemLoading && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${systemMetrics.memory.usage}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Database className="w-5 h-5" />
                      <span>Database</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {systemLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Loading...</span>
                      </div>
                    ) : systemError ? (
                      <div className="text-center">
                        <p className="text-red-500 text-sm">{systemError}</p>
                      </div>
                    ) : systemMetrics ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Connections</span>
                          <span className="text-sm font-medium">{systemMetrics.database.connections}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Avg Response</span>
                          <span className="text-sm font-medium">{systemMetrics.database.avg_response}ms</span>
                        </div>
                        <div className="flex items-center space-x-2 mt-3">
                          {getStatusIcon(systemMetrics.database.status)}
                          <span className="text-sm capitalize">{systemMetrics.database.status}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-gray-400 text-sm">No Data</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Wifi className="w-5 h-5" />
                      <span>Network</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {systemLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Loading...</span>
                      </div>
                    ) : systemError ? (
                      <div className="text-center">
                        <p className="text-red-500 text-sm">{systemError}</p>
                      </div>
                    ) : systemMetrics ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Bytes Received</span>
                          <span className="text-sm font-medium">{formatBytes(systemMetrics.network.bytes_recv)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Bytes Sent</span>
                          <span className="text-sm font-medium">{formatBytes(systemMetrics.network.bytes_sent)}</span>
                        </div>
                        <div className="flex items-center space-x-2 mt-3">
                          {getStatusIcon(systemMetrics.network.status)}
                          <span className="text-sm capitalize">{systemMetrics.network.status}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-gray-400 text-sm">No Data</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* System Overview Grid */}
              {systemMetrics && !systemLoading && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>System Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-2">{systemMetrics.cpu.usage}%</div>
                        <div className="text-sm text-gray-600">CPU Usage</div>
                        <div className="text-xs text-gray-500 mt-1">{systemMetrics.cpu.cores} cores</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-600 mb-2">{systemMetrics.memory.usage}%</div>
                        <div className="text-sm text-gray-600">Memory Usage</div>
                        <div className="text-xs text-gray-500 mt-1">{systemMetrics.memory.total_gb} GB total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-orange-600 mb-2">{systemMetrics.disk.usage}%</div>
                        <div className="text-sm text-gray-600">Disk Usage</div>
                        <div className="text-xs text-gray-500 mt-1">{systemMetrics.disk.total_gb} GB total</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Assets Detailed View */}
          {currentPage === 'assets' && (
            <div className="p-8">
              <div className="flex items-center space-x-2 mb-6">
                <Layers className="w-6 h-6 text-purple-600" />
                <h2 className="text-2xl font-bold text-gray-900">Assets & Resource Management</h2>
              </div>
              <p className="text-gray-600 mb-8">Browser drivers, test data storage & cleanup management</p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Layers className="w-5 h-5" />
                      <span>Browser Drivers</span>
                    </CardTitle>
                    <CardDescription>Manage browser drivers and versions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {driversLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span>Loading drivers...</span>
                        </div>
                      ) : driversError ? (
                        <div className="text-center py-4">
                          <p className="text-red-500 text-sm mb-2">{driversError}</p>
                          <Button onClick={refetchDrivers} size="sm" variant="outline">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry
                          </Button>
                        </div>
                      ) : browserDrivers && browserDrivers.drivers.length > 0 ? (
                        browserDrivers.drivers.map((driver, index) => (
                          <Card key={index} className={`${driver.status === 'available' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-gray-900 mb-1">{driver.name}</h4>
                                  <p className="text-sm text-gray-600 mb-2">
                                    {driver.version}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {driver.path ? `Path: ${driver.path}` : 'No path available'}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end space-y-2">
                                  <Badge variant={driver.status === 'available' ? 'default' : 'secondary'}>
                                    {driver.status === 'available' ? 'Available' : driver.status.replace('_', ' ')}
                                  </Badge>
                                  {driver.is_latest && (
                                    <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                                      Latest
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-gray-600">No browser drivers found</p>
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" className="flex-1" disabled={driversLoading}>
                        <Download className="w-4 h-4 mr-2" />
                        Update All
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={refetchDrivers} disabled={driversLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Check Updates
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Database className="w-5 h-5" />
                      <span>Test Data Management</span>
                    </CardTitle>
                    <CardDescription>Clean up and manage test data</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {testDataLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Loading test data stats...</span>
                      </div>
                    ) : testDataError ? (
                      <div className="text-center py-4">
                        <p className="text-red-500 text-sm mb-2">{testDataError}</p>
                        <Button onClick={refetchTestData} size="sm" variant="outline">
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </Button>
                      </div>
                    ) : testDataStats ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Test Results</p>
                            <p className="text-sm text-gray-600">Test result files</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatBytes(testDataStats.sizes.test_results)}</p>
                            <Button size="sm" variant="outline">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Clean
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Screenshots</p>
                            <p className="text-sm text-gray-600">Screenshot files</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatBytes(testDataStats.sizes.screenshots)}</p>
                            <Button size="sm" variant="outline">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Clean
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Reports</p>
                            <p className="text-sm text-gray-600">Generated reports</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatBytes(testDataStats.sizes.reports)}</p>
                            <Button size="sm" variant="outline">
                              <Download className="w-4 h-4 mr-2" />
                              Archive
                            </Button>
                          </div>
                        </div>
                        {testDataStats.oldest_file && (
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800">
                              Oldest file: {testDataStats.oldest_file.file} ({testDataStats.oldest_file.age_days} days old)
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-600">No test data stats available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Performance Detailed View */}
          {currentPage === 'performance' && (
            <div className="p-8">
              <div className="flex items-center space-x-2 mb-6">
                <TrendingUp className="w-6 h-6 text-green-600" />
                <h2 className="text-2xl font-bold text-gray-900">Performance Analytics</h2>
              </div>
              <p className="text-gray-600 mb-8">Test execution metrics and optimization insights</p>

              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5" />
                    <span>Test Performance Overview</span>
                  </CardTitle>
                  <CardDescription>Identify slow and flaky tests for optimization</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {testSuites ? (
                      <>
                        {/* Performance Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <Card className="bg-red-50 border-red-200">
                            <CardContent className="p-6">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-red-800">Failed Tests</p>
                                  <p className="text-3xl font-bold text-red-600">{testSuites.total_failed}</p>
                                </div>
                                <XCircle className="w-10 h-10 text-red-600" />
                              </div>
                              <p className="text-xs text-red-600 mt-2">Tests that failed in last run</p>
                            </CardContent>
                          </Card>

                          <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-6">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-green-800">Pass Rate</p>
                                  <p className="text-3xl font-bold text-green-600">{testSuites.pass_rate}%</p>
                                </div>
                                <CheckCircle className="w-10 h-10 text-green-600" />
                              </div>
                              <p className="text-xs text-green-600 mt-2">Overall test pass rate</p>
                            </CardContent>
                          </Card>

                          <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="p-6">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-blue-800">Total Tests</p>
                                  <p className="text-3xl font-bold text-blue-600">{testSuites.total_tests}</p>
                                </div>
                                <FileText className="w-10 h-10 text-blue-600" />
                              </div>
                              <p className="text-xs text-blue-600 mt-2">Total tests executed</p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Test Suite Details */}
                        {testSuites.suites.length > 0 && (
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Suite Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {testSuites.suites.map((suite, index) => (
                                <Card key={index} className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                                  <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                      <div className="flex items-center space-x-2">
                                        {getStatusIcon(testSuites.health_status)}
                                        <h4 className="font-semibold text-gray-900">{suite.name}</h4>
                                      </div>
                                      <Badge
                                        variant={testSuites.health_status === 'healthy' ? 'default' : testSuites.health_status === 'warning' ? 'secondary' : 'destructive'}
                                        className="text-xs"
                                      >
                                        {testSuites.health_status}
                                      </Badge>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center space-x-2">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                        <span className="text-sm text-gray-600">{suite.total_files} files</span>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <Calendar className="w-4 h-4 text-blue-600" />
                                        <span className="text-sm text-gray-600">
                                          {new Date(suite.last_modified).toLocaleDateString()}
                                        </span>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600">Loading performance metrics...</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Security Detailed View */}
          {currentPage === 'security' && (
            <div className="p-8">
              <div className="flex items-center space-x-2 mb-6">
                <Shield className="w-6 h-6 text-red-600" />
                <h2 className="text-2xl font-bold text-gray-900">Security & Compliance</h2>
              </div>
              <p className="text-gray-600 mb-8">SSL certificates, dependencies & access control monitoring</p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-gradient-to-br from-red-50 to-pink-50 border-red-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Shield className="w-5 h-5" />
                      <span>Security Status</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {securityLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        <span>Loading security status...</span>
                      </div>
                    ) : securityError ? (
                      <div className="text-center">
                        <p className="text-red-500">{securityError}</p>
                      </div>
                    ) : securityStatus ? (
                      <div className="space-y-3">
                        <Card className="bg-green-50 border-green-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Lock className="w-4 h-4 text-green-600" />
                                <span className="font-medium">SSL Certificates</span>
                              </div>
                              <Badge variant={securityStatus.ssl_certificates.valid ? 'default' : 'destructive'}>
                                {securityStatus.ssl_certificates.valid ? 'Valid' : 'Invalid'}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-yellow-50 border-yellow-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                <span className="font-medium">Dependencies</span>
                              </div>
                              <Badge variant={securityStatus.dependencies.vulnerabilities > 0 ? 'destructive' : 'default'}>
                                {securityStatus.dependencies.vulnerabilities} Issues
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-green-50 border-green-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="font-medium">Security Score</span>
                              </div>
                              <Badge variant="default">
                                {securityStatus.security_score}/100
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-gray-400">No security data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Lock className="w-5 h-5" />
                      <span>Recent Logins</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {securityLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        <span>Loading...</span>
                      </div>
                    ) : securityStatus ? (
                      <div className="space-y-3">
                        {securityStatus.recent_logins.length > 0 ? (
                          securityStatus.recent_logins.map((login, index) => (
                            <Card key={index} className={`${login.status === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    {login.status === 'success' ? (
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-600" />
                                    )}
                                    <span className="text-sm font-medium">{login.user}</span>
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {new Date(login.timestamp).toLocaleString()}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-gray-600">No recent login data</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-gray-400">No login data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tasks Detailed View */}
          {currentPage === 'tasks' && (
            <div className="p-8">
              <div className="flex items-center space-x-2 mb-6">
                <Calendar className="w-6 h-6 text-orange-600" />
                <h2 className="text-2xl font-bold text-gray-900">Maintenance Tasks</h2>
              </div>
              <p className="text-gray-600 mb-8">Schedule and monitor maintenance activities</p>

              <Card className="bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>Maintenance Tasks & Automation</span>
                  </CardTitle>
                  <CardDescription>Schedule and monitor maintenance activities</CardDescription>
                </CardHeader>
                <CardContent>
                  {tasksLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      <span>Loading tasks...</span>
                    </div>
                  ) : tasksError ? (
                    <div className="text-center py-8">
                      <p className="text-red-600 mb-2">{tasksError}</p>
                      <Button onClick={refetchTasks} size="sm" variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                      </Button>
                    </div>
                  ) : maintenanceTasksData ? (
                    <div className="space-y-6">
                      {maintenanceTasksData.tasks.length > 0 ? (
                        <>
                          <h4 className="font-semibold text-gray-900 mb-4">Active Tasks</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {maintenanceTasksData.tasks.map((task) => (
                              <Card key={task.id} className={`${task.status === 'completed' ? 'bg-green-50 border-green-200' : task.status === 'failed' ? 'bg-red-50 border-red-200' : task.status === 'running' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center space-x-2">
                                      {getStatusIcon(task.status)}
                                      <h4 className="font-semibold text-gray-900">{task.name}</h4>
                                    </div>
                                    <div className="flex flex-col items-end space-y-1">
                                      <Badge
                                        variant={
                                          task.priority === 'high' ? 'destructive' :
                                          task.priority === 'medium' ? 'secondary' : 'outline'
                                        }
                                        className="text-xs"
                                      >
                                        {task.priority}
                                      </Badge>
                                      <Badge
                                        variant={
                                          task.status === 'completed' ? 'default' :
                                          task.status === 'running' ? 'secondary' :
                                          task.status === 'failed' ? 'destructive' : 'outline'
                                        }
                                        className="text-xs"
                                      >
                                        {task.status}
                                      </Badge>
                                    </div>
                                  </div>
                                  {task.description && (
                                    <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                                  )}
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span className="text-sm text-gray-600">Scheduled: {task.scheduled}</span>
                                    </div>
                                    {task.executed && (
                                      <div className="flex items-center space-x-2">
                                        <Clock className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm text-gray-600">Executed: {task.executed}</span>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-gray-600">No maintenance tasks found</p>
                        </div>
                      )}

                      {maintenanceTasksData.suggestions.length > 0 && (
                        <div className="mt-8">
                          <h4 className="font-semibold text-gray-900 mb-4">Maintenance Suggestions</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {maintenanceTasksData.suggestions.map((suggestion, index) => (
                              <Card key={index} className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                      <h4 className="font-semibold text-blue-900 mb-2">{suggestion.title}</h4>
                                      <p className="text-sm text-blue-700 mb-3">{suggestion.description}</p>
                                    </div>
                                    <div className="ml-4">
                                      <Badge variant="outline" className="bg-blue-100 text-blue-800 text-xs">
                                        {suggestion.type}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-blue-600">{suggestion.action}</span>
                                    <Button size="sm" variant="outline" className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600">
                                      <Plus className="w-4 h-4 mr-1" />
                                      Add Task
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-600">No maintenance tasks data available</p>
                    </div>
                  )}
                  <div className="mt-6 flex space-x-2">
                    <Button className="flex-1">
                      <Plus className="w-4 h-4 mr-2" />
                      Schedule New Task
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={refreshAllData} disabled={refreshing}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
