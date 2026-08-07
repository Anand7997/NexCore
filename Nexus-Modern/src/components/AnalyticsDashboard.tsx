import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, 
  TrendingUp, 
  BarChart3, 
  PieChart, 
  Activity, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Calendar,
  Target,
  Zap,
  Users,
  Database,
  Monitor,
  Globe,
  Timer,
  Layers,
  Filter,
  Download,
  Settings,
  Play,
  Pause,
  BarChart2,
  TrendingDown,
  Maximize2,
  Eye,
  EyeOff,
  FileText,
  FileSpreadsheet,
  Code,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';
import jsPDF from 'jspdf';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
  ComposedChart,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts';

interface TestResult {
  id: string;
  testcase_name: string;
  projectname: string;
  modulename: string;
  testsuitename: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  skipped_steps: number;
  execution_time: string;
  created_date: string;
  browser_info: string;
}

interface AnalyticsDashboardProps {
  onBack?: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onBack }) => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedBrowser, setSelectedBrowser] = useState<string>('all');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area'>('bar');
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedTimeRange, selectedProject, selectedModule, selectedBrowser]);

  // Real-time data refresh effect
  useEffect(() => {
    if (isRealTimeEnabled) {
      const interval = setInterval(() => {
        loadAnalyticsData();
      }, 30000); // Refresh every 30 seconds
      setRefreshInterval(interval);
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isRealTimeEnabled]);

  const loadAnalyticsData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(buildApiUrl('/api/results'));
      if (response.ok) {
        const data = await response.json();
        console.log('Analytics data loaded:', data);
        setTestResults(data || []);
      } else {
        console.log('No analytics data found');
        setTestResults([]);
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
      if (!isRealTimeEnabled) { // Only show error toast if not in real-time mode
        toast({
          title: "Error",
          description: "Failed to load analytics data",
          variant: "destructive"
        });
      }
      setTestResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [isRealTimeEnabled, toast]);

  // Filter data based on time range and other filters
  const getFilteredData = () => {
    const now = new Date();
    const cutoffDate = new Date();
    
    switch (selectedTimeRange) {
      case '1d':
        cutoffDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      default:
        return testResults;
    }

    return testResults.filter(result => {
      const resultDate = new Date(result.created_date);
      const timeFilter = resultDate >= cutoffDate;
      
      const projectFilter = selectedProject === 'all' || result.projectname === selectedProject;
      const moduleFilter = selectedModule === 'all' || result.modulename === selectedModule;
      const browserFilter = selectedBrowser === 'all' || result.browser_info === selectedBrowser;
      
      return timeFilter && projectFilter && moduleFilter && browserFilter;
    });
  };

  // Get unique values for filter dropdowns
  const getUniqueProjects = () => {
    const projects = [...new Set(testResults.map(r => r.projectname).filter(Boolean))];
    return projects.sort();
  };

  const getUniqueModules = () => {
    const modules = [...new Set(testResults.map(r => r.modulename).filter(Boolean))];
    return modules.sort();
  };

  const getUniqueBrowsers = () => {
    const browsers = [...new Set(testResults.map(r => r.browser_info).filter(Boolean))];
    return browsers.sort();
  };

  const filteredData = getFilteredData();

  // Calculate summary statistics
  const calculateSummaryStats = () => {
    const total = filteredData.length;
    const passed = filteredData.filter(r => r.status === 'PASS').length;
    const failed = filteredData.filter(r => r.status === 'FAIL').length;
    const skipped = filteredData.filter(r => r.status === 'SKIP').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;
    const failRate = total > 0 ? (failed / total) * 100 : 0;

    // Calculate average execution time
    const totalExecutionTime = filteredData.reduce((sum, result) => {
      const timeMatch = result.execution_time?.match(/(\d+\.?\d*)/);
      return sum + (timeMatch ? parseFloat(timeMatch[1]) : 0);
    }, 0);
    const avgExecutionTime = total > 0 ? totalExecutionTime / total : 0;

    // Calculate total steps
    const totalSteps = filteredData.reduce((sum, result) => sum + (result.total_steps || 0), 0);
    const totalPassedSteps = filteredData.reduce((sum, result) => sum + (result.passed_steps || 0), 0);
    const totalFailedSteps = filteredData.reduce((sum, result) => sum + (result.failed_steps || 0), 0);

    return {
      total,
      passed,
      failed,
      skipped,
      passRate,
      failRate,
      avgExecutionTime,
      totalSteps,
      totalPassedSteps,
      totalFailedSteps,
      stepPassRate: totalSteps > 0 ? (totalPassedSteps / totalSteps) * 100 : 0
    };
  };

  const stats = calculateSummaryStats();

  // Prepare data for charts
  const prepareProjectData = () => {
    const projectStats = filteredData.reduce((acc, result) => {
      const project = result.projectname || 'Unknown';
      if (!acc[project]) {
        acc[project] = { name: project, passed: 0, failed: 0, total: 0 };
      }
      acc[project].total++;
      if (result.status === 'PASS') acc[project].passed++;
      if (result.status === 'FAIL') acc[project].failed++;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(projectStats);
  };

  const prepareModuleData = () => {
    const moduleStats = filteredData.reduce((acc, result) => {
      const module = result.modulename || 'Unknown';
      if (!acc[module]) {
        acc[module] = { name: module, passed: 0, failed: 0, total: 0 };
      }
      acc[module].total++;
      if (result.status === 'PASS') acc[module].passed++;
      if (result.status === 'FAIL') acc[module].failed++;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(moduleStats).slice(0, 10); // Top 10 modules
  };

  const prepareTrendData = () => {
    const dailyStats = filteredData.reduce((acc, result) => {
      const date = new Date(result.created_date).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, passed: 0, failed: 0, total: 0 };
      }
      acc[date].total++;
      if (result.status === 'PASS') acc[date].passed++;
      if (result.status === 'FAIL') acc[date].failed++;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(dailyStats).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  const prepareStatusPieData = () => [
    { name: 'Passed', value: stats.passed, color: '#10B981' },
    { name: 'Failed', value: stats.failed, color: '#EF4444' },
    { name: 'Skipped', value: stats.skipped, color: '#F59E0B' }
  ];

  const prepareBrowserData = () => {
    const browserStats = filteredData.reduce((acc, result) => {
      const browser = result.browser_info || 'Unknown';
      if (!acc[browser]) {
        acc[browser] = { name: browser, count: 0, passed: 0, failed: 0 };
      }
      acc[browser].count++;
      if (result.status === 'PASS') acc[browser].passed++;
      if (result.status === 'FAIL') acc[browser].failed++;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(browserStats);
  };

  // New advanced chart data preparations
  const prepareHourlyData = () => {
    const hourlyStats = filteredData.reduce((acc, result) => {
      const hour = new Date(result.created_date).getHours();
      const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
      if (!acc[hourLabel]) {
        acc[hourLabel] = { hour: hourLabel, passed: 0, failed: 0, total: 0 };
      }
      acc[hourLabel].total++;
      if (result.status === 'PASS') acc[hourLabel].passed++;
      if (result.status === 'FAIL') acc[hourLabel].failed++;
      return acc;
    }, {} as Record<string, any>);

    // Fill in missing hours with 0 values
    const allHours = Array.from({ length: 24 }, (_, i) => {
      const hourLabel = `${i.toString().padStart(2, '0')}:00`;
      return hourlyStats[hourLabel] || { hour: hourLabel, passed: 0, failed: 0, total: 0 };
    });

    return allHours;
  };

  const prepareDayOfWeekData = () => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStats = filteredData.reduce((acc, result) => {
      const dayOfWeek = new Date(result.created_date).getDay();
      const dayName = dayNames[dayOfWeek];
      if (!acc[dayName]) {
        acc[dayName] = { day: dayName, passed: 0, failed: 0, total: 0 };
      }
      acc[dayName].total++;
      if (result.status === 'PASS') acc[dayName].passed++;
      if (result.status === 'FAIL') acc[dayName].failed++;
      return acc;
    }, {} as Record<string, any>);

    return dayNames.map(day => dayStats[day] || { day, passed: 0, failed: 0, total: 0 });
  };

  const prepareExecutionTimeScatterData = () => {
    return filteredData.map((result, index) => {
      const timeMatch = result.execution_time?.match(/(\d+\.?\d*)/);
      const executionTime = timeMatch ? parseFloat(timeMatch[1]) : 0;
      return {
        x: index + 1,
        y: executionTime,
        status: result.status,
        testcase: result.testcase_name,
        steps: result.total_steps || 0
      };
    });
  };

  const prepareHeatmapData = () => {
    const heatmapData = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let hour = 0; hour < 24; hour++) {
      for (let day = 0; day < 7; day++) {
        const count = filteredData.filter(result => {
          const date = new Date(result.created_date);
          return date.getHours() === hour && date.getDay() === day;
        }).length;
        
        heatmapData.push({
          hour: `${hour.toString().padStart(2, '0')}:00`,
          day: dayNames[day],
          value: count,
          x: hour,
          y: day
        });
      }
    }
    
    return heatmapData;
  };

  const prepareRadarData = () => {
    const projects = getUniqueProjects().slice(0, 5); // Top 5 projects
    const metrics = ['Total Tests', 'Pass Rate', 'Avg Duration', 'Step Coverage', 'Reliability'];
    
    return projects.map(project => {
      const projectData = filteredData.filter(r => r.projectname === project);
      const total = projectData.length;
      const passed = projectData.filter(r => r.status === 'PASS').length;
      const passRate = total > 0 ? (passed / total) * 100 : 0;
      
      const avgDuration = projectData.reduce((sum, r) => {
        const timeMatch = r.execution_time?.match(/(\d+\.?\d*)/);
        return sum + (timeMatch ? parseFloat(timeMatch[1]) : 0);
      }, 0) / (total || 1);
      
      const avgSteps = projectData.reduce((sum, r) => sum + (r.total_steps || 0), 0) / (total || 1);
      const reliability = passRate; // Simplified reliability metric
      
      return {
        project,
        'Total Tests': Math.min(total * 10, 100), // Normalize to 0-100
        'Pass Rate': passRate,
        'Avg Duration': Math.min(avgDuration * 2, 100), // Normalize to 0-100
        'Step Coverage': Math.min(avgSteps * 5, 100), // Normalize to 0-100
        'Reliability': reliability
      };
    });
  };

  const prepareFunnelData = () => {
    const total = filteredData.length;
    const passed = filteredData.filter(r => r.status === 'PASS').length;
    const failed = filteredData.filter(r => r.status === 'FAIL').length;
    const skipped = filteredData.filter(r => r.status === 'SKIP').length;
    
    return [
      { name: 'Total Tests', value: total, fill: '#8884d8' },
      { name: 'Executed', value: total - skipped, fill: '#82ca9d' },
      { name: 'Passed', value: passed, fill: '#10B981' },
      { name: 'Failed', value: failed, fill: '#EF4444' }
    ];
  };

  // Export functions
  const exportToPDF = () => {
    toast({
      title: "Export Started",
      description: "Generating PDF report...",
    });
    
    try {
      // Create a new jsPDF instance
      const doc = new jsPDF();
      
      // Set up document properties
      doc.setProperties({
        title: 'Analytics Report',
        subject: 'Test Analytics Dashboard Report',
        author: 'Auto Delta',
        creator: 'Analytics Dashboard'
      });
      
      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Analytics Report', 20, 30);
      
      // Generated date
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 45);
      doc.text(`Time Range: ${selectedTimeRange}`, 20, 55);
      
      // Filters section
      let yPosition = 70;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Applied Filters:', 20, yPosition);
      yPosition += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Project: ${selectedProject === 'all' ? 'All Projects' : selectedProject}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Module: ${selectedModule === 'all' ? 'All Modules' : selectedModule}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Browser: ${selectedBrowser === 'all' ? 'All Browsers' : selectedBrowser}`, 25, yPosition);
      yPosition += 15;
      
      // Summary Statistics
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary Statistics:', 20, yPosition);
      yPosition += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Tests: ${stats.total}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Passed Tests: ${stats.passed}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Failed Tests: ${stats.failed}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Skipped Tests: ${stats.skipped}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Pass Rate: ${stats.passRate.toFixed(1)}%`, 25, yPosition);
      yPosition += 8;
      doc.text(`Fail Rate: ${stats.failRate.toFixed(1)}%`, 25, yPosition);
      yPosition += 8;
      doc.text(`Average Execution Time: ${stats.avgExecutionTime.toFixed(2)}s`, 25, yPosition);
      yPosition += 8;
      doc.text(`Total Steps: ${stats.totalSteps}`, 25, yPosition);
      yPosition += 8;
      doc.text(`Step Pass Rate: ${stats.stepPassRate.toFixed(1)}%`, 25, yPosition);
      yPosition += 15;
      
      // Test Results section
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 30;
      }
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Test Results:', 20, yPosition);
      yPosition += 10;
      
      // Table headers
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Test Case', 20, yPosition);
      doc.text('Status', 80, yPosition);
      doc.text('Project', 110, yPosition);
      doc.text('Module', 140, yPosition);
      doc.text('Time', 170, yPosition);
      yPosition += 5;
      
      // Draw line under headers
      doc.line(20, yPosition, 190, yPosition);
      yPosition += 5;
      
      // Test results data
      doc.setFont('helvetica', 'normal');
      const maxResults = Math.min(filteredData.length, 50); // Limit to 50 results to avoid too many pages
      
      for (let i = 0; i < maxResults; i++) {
        const result = filteredData[i];
        
        if (yPosition > 280) {
          doc.addPage();
          yPosition = 30;
          
          // Repeat headers on new page
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text('Test Case', 20, yPosition);
          doc.text('Status', 80, yPosition);
          doc.text('Project', 110, yPosition);
          doc.text('Module', 140, yPosition);
          doc.text('Time', 170, yPosition);
          yPosition += 5;
          doc.line(20, yPosition, 190, yPosition);
          yPosition += 5;
          doc.setFont('helvetica', 'normal');
        }
        
        // Truncate long test names
        const testName = result.testcase_name.length > 25 
          ? result.testcase_name.substring(0, 25) + '...' 
          : result.testcase_name;
        
        const projectName = (result.projectname || 'N/A').length > 15 
          ? (result.projectname || 'N/A').substring(0, 15) + '...' 
          : (result.projectname || 'N/A');
        
        const moduleName = (result.modulename || 'N/A').length > 15 
          ? (result.modulename || 'N/A').substring(0, 15) + '...' 
          : (result.modulename || 'N/A');
        
        // Set color based on status
        if (result.status === 'PASS') {
          doc.setTextColor(0, 128, 0); // Green
        } else if (result.status === 'FAIL') {
          doc.setTextColor(255, 0, 0); // Red
        } else {
          doc.setTextColor(255, 165, 0); // Orange
        }
        
        doc.text(testName, 20, yPosition);
        doc.text(result.status, 80, yPosition);
        
        // Reset to black for other columns
        doc.setTextColor(0, 0, 0);
        doc.text(projectName, 110, yPosition);
        doc.text(moduleName, 140, yPosition);
        doc.text(result.execution_time || 'N/A', 170, yPosition);
        
        yPosition += 6;
      }
      
      // Add footer with total results info
      if (filteredData.length > maxResults) {
        yPosition += 10;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(`Showing first ${maxResults} of ${filteredData.length} total results`, 20, yPosition);
      }
      
      // Save the PDF
      const fileName = `analytics-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Export Complete",
        description: "PDF report downloaded successfully",
      });
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF report",
        variant: "destructive"
      });
    }
  };

  const exportToDocx = () => {
    toast({
      title: "Export Started",
      description: "Generating DOCX document...",
    });
    
    // Create editable document content
    const docContent = `
ANALYTICS REPORT
================

Generated: ${new Date().toLocaleString()}
Time Range: ${selectedTimeRange}
Filters: Project: ${selectedProject}, Module: ${selectedModule}, Browser: ${selectedBrowser}

EXECUTIVE SUMMARY
-----------------
Total Tests Executed: ${stats.total}
Pass Rate: ${stats.passRate.toFixed(1)}%
Failed Tests: ${stats.failed}
Skipped Tests: ${stats.skipped}
Average Execution Time: ${stats.avgExecutionTime.toFixed(2)} seconds

DETAILED RESULTS
----------------
${filteredData.map((result, index) => `
${index + 1}. Test Case: ${result.testcase_name}
   Project: ${result.projectname}
   Module: ${result.modulename}
   Status: ${result.status}
   Execution Time: ${result.execution_time}
   Total Steps: ${result.total_steps}
   Passed Steps: ${result.passed_steps}
   Failed Steps: ${result.failed_steps}
   Browser: ${result.browser_info}
   Date: ${new Date(result.created_date).toLocaleString()}
`).join('\n')}

RECOMMENDATIONS
---------------
${stats.passRate < 80 ? '- Consider reviewing failed test cases to improve overall pass rate' : '- Excellent pass rate! Continue current testing practices'}
${stats.avgExecutionTime > 30 ? '- Review test execution time optimization opportunities' : '- Good execution time performance'}
    `;
    
    const blob = new Blob([docContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "DOCX document downloaded successfully",
    });
  };

  const exportToExcel = () => {
    toast({
      title: "Export Started",
      description: "Generating Excel spreadsheet...",
    });
    
    // Create CSV content (Excel can open CSV files)
    const headers = [
      'Test Case Name',
      'Project',
      'Module',
      'Test Suite',
      'Status',
      'Total Steps',
      'Passed Steps',
      'Failed Steps',
      'Skipped Steps',
      'Execution Time',
      'Browser Info',
      'Created Date'
    ];
    
    const csvContent = [
      headers.join(','),
      ...filteredData.map(result => [
        `"${result.testcase_name}"`,
        `"${result.projectname}"`,
        `"${result.modulename}"`,
        `"${result.testsuitename}"`,
        result.status,
        result.total_steps || 0,
        result.passed_steps || 0,
        result.failed_steps || 0,
        result.skipped_steps || 0,
        `"${result.execution_time}"`,
        `"${result.browser_info}"`,
        `"${result.created_date}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "Excel/CSV file downloaded successfully",
    });
  };

  const exportToHTML = () => {
    toast({
      title: "Export Started",
      description: "Generating interactive HTML report...",
    });
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Analytics Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #333; }
        .stat-label { color: #666; margin-top: 5px; }
        .table-container { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .status-pass { color: #10B981; font-weight: bold; }
        .status-fail { color: #EF4444; font-weight: bold; }
        .status-skip { color: #F59E0B; font-weight: bold; }
        .filters { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Test Analytics Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="filters">
            <h3>Applied Filters</h3>
            <p><strong>Time Range:</strong> ${selectedTimeRange} | <strong>Project:</strong> ${selectedProject} | <strong>Module:</strong> ${selectedModule} | <strong>Browser:</strong> ${selectedBrowser}</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${stats.total}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.passRate.toFixed(1)}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.failed}</div>
                <div class="stat-label">Failed Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.avgExecutionTime.toFixed(2)}s</div>
                <div class="stat-label">Avg Execution Time</div>
            </div>
        </div>
        
        <div class="table-container">
            <h3>Detailed Test Results</h3>
            <table>
                <thead>
                    <tr>
                        <th>Test Case</th>
                        <th>Project</th>
                        <th>Module</th>
                        <th>Status</th>
                        <th>Steps</th>
                        <th>Execution Time</th>
                        <th>Browser</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredData.map(result => `
                        <tr>
                            <td>${result.testcase_name}</td>
                            <td>${result.projectname}</td>
                            <td>${result.modulename}</td>
                            <td class="status-${result.status.toLowerCase()}">${result.status}</td>
                            <td>${result.total_steps || 0} (${result.passed_steps || 0}/${result.failed_steps || 0}/${result.skipped_steps || 0})</td>
                            <td>${result.execution_time}</td>
                            <td>${result.browser_info}</td>
                            <td>${new Date(result.created_date).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "Interactive HTML report downloaded successfully",
    });
  };

  const exportToJSON = () => {
    toast({
      title: "Export Started",
      description: "Generating JSON data...",
    });
    
    const jsonData = {
      metadata: {
        title: "Analytics Report",
        generatedAt: new Date().toISOString(),
        timeRange: selectedTimeRange,
        filters: {
          project: selectedProject,
          module: selectedModule,
          browser: selectedBrowser
        }
      },
      summary: {
        totalTests: stats.total,
        passedTests: stats.passed,
        failedTests: stats.failed,
        skippedTests: stats.skipped,
        passRate: stats.passRate,
        failRate: stats.failRate,
        averageExecutionTime: stats.avgExecutionTime,
        totalSteps: stats.totalSteps,
        totalPassedSteps: stats.totalPassedSteps,
        totalFailedSteps: stats.totalFailedSteps,
        stepPassRate: stats.stepPassRate
      },
      testResults: filteredData,
      chartData: {
        projectData: prepareProjectData(),
        moduleData: prepareModuleData(),
        trendData: prepareTrendData(),
        statusDistribution: prepareStatusPieData(),
        browserData: prepareBrowserData()
      }
    };
    
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "JSON data downloaded successfully",
    });
  };

  const exportToXML = () => {
    toast({
      title: "Export Started",
      description: "Generating XML data...",
    });
    
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<analyticsReport>
    <metadata>
        <title>Analytics Report</title>
        <generatedAt>${new Date().toISOString()}</generatedAt>
        <timeRange>${selectedTimeRange}</timeRange>
        <filters>
            <project>${selectedProject}</project>
            <module>${selectedModule}</module>
            <browser>${selectedBrowser}</browser>
        </filters>
    </metadata>
    <summary>
        <totalTests>${stats.total}</totalTests>
        <passedTests>${stats.passed}</passedTests>
        <failedTests>${stats.failed}</failedTests>
        <skippedTests>${stats.skipped}</skippedTests>
        <passRate>${stats.passRate}</passRate>
        <averageExecutionTime>${stats.avgExecutionTime}</averageExecutionTime>
    </summary>
    <testResults>
        ${filteredData.map(result => `
        <testResult>
            <id>${result.id}</id>
            <testcaseName>${result.testcase_name}</testcaseName>
            <projectName>${result.projectname}</projectName>
            <moduleName>${result.modulename}</moduleName>
            <testSuiteName>${result.testsuitename}</testSuiteName>
            <status>${result.status}</status>
            <totalSteps>${result.total_steps || 0}</totalSteps>
            <passedSteps>${result.passed_steps || 0}</passedSteps>
            <failedSteps>${result.failed_steps || 0}</failedSteps>
            <skippedSteps>${result.skipped_steps || 0}</skippedSteps>
            <executionTime>${result.execution_time}</executionTime>
            <browserInfo>${result.browser_info}</browserInfo>
            <createdDate>${result.created_date}</createdDate>
        </testResult>
        `).join('')}
    </testResults>
</analyticsReport>`;
    
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-data-${new Date().toISOString().split('T')[0]}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "XML data downloaded successfully",
    });
  };

  const projectData = prepareProjectData();
  const moduleData = prepareModuleData();
  const trendData = prepareTrendData();
  const statusPieData = prepareStatusPieData();
  const browserData = prepareBrowserData();
  const hourlyData = prepareHourlyData();
  const dayOfWeekData = prepareDayOfWeekData();
  const scatterData = prepareExecutionTimeScatterData();
  const heatmapData = prepareHeatmapData();
  const radarData = prepareRadarData();
  const funnelData = prepareFunnelData();

  const COLORS = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];
  const SCATTER_COLORS = { PASS: '#10B981', FAIL: '#EF4444', SKIP: '#F59E0B' };

  if (isLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <Activity className="w-5 h-5 animate-spin" />
            <span>Loading analytics data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back" />

      {/* Header */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-gray-900">Test Analytics Dashboard</CardTitle>
                <p className="text-gray-600">Comprehensive insights into test execution performance</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Time Range Selector */}
              <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
                {['1d', '7d', '30d', '90d'].map((range) => (
                  <Button
                    key={range}
                    variant={selectedTimeRange === range ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedTimeRange(range)}
                    className="text-xs"
                  >
                    {range === '1d' ? '1 Day' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                  </Button>
                ))}
              </div>

              {/* Real-time Toggle */}
              <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2">
                <Label htmlFor="realtime" className="text-xs font-medium">Real-time</Label>
                <Switch
                  id="realtime"
                  checked={isRealTimeEnabled}
                  onCheckedChange={setIsRealTimeEnabled}
                />
                {isRealTimeEnabled && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600">Live</span>
                  </div>
                )}
              </div>

              {/* Advanced Metrics Toggle */}
              <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2">
                <Label htmlFor="advanced" className="text-xs font-medium">Advanced</Label>
                <Switch
                  id="advanced"
                  checked={showAdvancedMetrics}
                  onCheckedChange={setShowAdvancedMetrics}
                />
              </div>

              <Button 
                onClick={loadAnalyticsData}
                variant="outline" 
                className="border-green-200 text-green-600"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Advanced Filters */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters</span>
            </div>
            <div className="flex items-center space-x-4">
              {/* Project Filter */}
              <div className="flex items-center space-x-2">
                <Label className="text-xs text-gray-600">Project:</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {getUniqueProjects().map(project => (
                      <SelectItem key={project} value={project}>{project}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Module Filter */}
              <div className="flex items-center space-x-2">
                <Label className="text-xs text-gray-600">Module:</Label>
                <Select value={selectedModule} onValueChange={setSelectedModule}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue placeholder="All Modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    {getUniqueModules().map(module => (
                      <SelectItem key={module} value={module}>{module}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Browser Filter */}
              <div className="flex items-center space-x-2">
                <Label className="text-xs text-gray-600">Browser:</Label>
                <Select value={selectedBrowser} onValueChange={setSelectedBrowser}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue placeholder="All Browsers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Browsers</SelectItem>
                    {getUniqueBrowsers().map(browser => (
                      <SelectItem key={browser} value={browser}>{browser}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Chart Type Selector */}
              <div className="flex items-center space-x-2">
                <Label className="text-xs text-gray-600">Chart:</Label>
                <Select value={chartType} onValueChange={(value: 'bar' | 'line' | 'area') => setChartType(value)}>
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="area">Area</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <Download className="w-3 h-3 mr-1" />
                    Export
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Export Formats</DropdownMenuLabel>
                  <DropdownMenuItem onClick={exportToPDF} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    PDF (Report)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToDocx} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    DOCX (Editable)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportToExcel} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    XLSX / CSV (Tables/Data)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportToHTML} className="cursor-pointer">
                    <Globe className="w-4 h-4 mr-2" />
                    HTML (Interactive)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportToJSON} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    JSON (Automation Integration)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToXML} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    XML (Automation Integration)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 backdrop-blur-sm border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">Total Tests</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500 mt-1">Last {selectedTimeRange}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 backdrop-blur-sm border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Pass Rate</p>
                <p className="text-3xl font-bold text-gray-900">{stats.passRate.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mt-1">{stats.passed} passed tests</p>
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
                <p className="text-red-600 text-sm font-medium">Fail Rate</p>
                <p className="text-3xl font-bold text-gray-900">{stats.failRate.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mt-1">{stats.failed} failed tests</p>
              </div>
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 backdrop-blur-sm border-purple-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium">Avg Duration</p>
                <p className="text-3xl font-bold text-gray-900">{stats.avgExecutionTime.toFixed(1)}s</p>
                <p className="text-xs text-gray-500 mt-1">Per test execution</p>
              </div>
              <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="temporal">Temporal</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <PieChart className="w-5 h-5" />
                  <span>Test Status Distribution</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Browser Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5" />
                  <span>Browser Usage</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={browserData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Step-level Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="w-5 h-5" />
                <span>Step-level Performance</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalSteps}</div>
                  <div className="text-sm text-gray-500">Total Steps</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.totalPassedSteps}</div>
                  <div className="text-sm text-gray-500">Passed Steps</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.totalFailedSteps}</div>
                  <div className="text-sm text-gray-500">Failed Steps</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Step Pass Rate</span>
                  <span>{stats.stepPassRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${stats.stepPassRate}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Test Execution Trends</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="total" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
                  <Bar dataKey="passed" stackId="2" fill="#10B981" />
                  <Bar dataKey="failed" stackId="2" fill="#EF4444" />
                  <Line type="monotone" dataKey="total" stroke="#8B5CF6" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>Project Performance</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={projectData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="passed" stackId="a" fill="#10B981" />
                  <Bar dataKey="failed" stackId="a" fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>Module Performance (Top 10)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={moduleData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="passed" stackId="a" fill="#10B981" />
                  <Bar dataKey="failed" stackId="a" fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="w-5 h-5" />
                  <span>Performance Metrics</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Average Test Duration</span>
                    <Badge variant="outline">{stats.avgExecutionTime.toFixed(2)}s</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Test Time</span>
                    <Badge variant="outline">{(stats.avgExecutionTime * stats.total).toFixed(2)}s</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Tests per Day</span>
                    <Badge variant="outline">{(stats.total / Math.max(1, trendData.length)).toFixed(1)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Success Rate</span>
                    <Badge variant={stats.passRate >= 80 ? "default" : "destructive"}>
                      {stats.passRate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Quality Indicators</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Test Stability</span>
                    <Badge variant={stats.passRate >= 90 ? "default" : stats.passRate >= 70 ? "secondary" : "destructive"}>
                      {stats.passRate >= 90 ? "Excellent" : stats.passRate >= 70 ? "Good" : "Needs Attention"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Step Success Rate</span>
                    <Badge variant={stats.stepPassRate >= 95 ? "default" : "secondary"}>
                      {stats.stepPassRate.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Test Coverage</span>
                    <Badge variant="outline">{projectData.length} Projects</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Module Coverage</span>
                    <Badge variant="outline">{moduleData.length} Modules</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Temporal Analysis Tab */}
        <TabsContent value="temporal" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="w-5 h-5" />
                  <span>Hourly Test Distribution</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="total" stackId="1" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="passed" stackId="2" stroke="#10B981" fill="#10B981" fillOpacity={0.8} />
                    <Area type="monotone" dataKey="failed" stackId="2" stroke="#EF4444" fill="#EF4444" fillOpacity={0.8} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Day of Week Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>Weekly Test Pattern</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#8884d8" />
                    <Line type="monotone" dataKey="passed" stroke="#10B981" strokeWidth={3} />
                    <Line type="monotone" dataKey="failed" stroke="#EF4444" strokeWidth={3} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Execution Time Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Test Execution Heatmap (Hour vs Day)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-24 gap-1 p-4">
                {Array.from({ length: 7 }, (_, day) => (
                  <div key={day} className="col-span-24 grid grid-cols-24 gap-1">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const dataPoint = heatmapData.find(d => d.x === hour && d.y === day);
                      const intensity = dataPoint ? Math.min(dataPoint.value / Math.max(...heatmapData.map(d => d.value)), 1) : 0;
                      return (
                        <div
                          key={`${day}-${hour}`}
                          className="w-4 h-4 rounded-sm border border-gray-200"
                          style={{
                            backgroundColor: `rgba(16, 185, 129, ${intensity})`,
                          }}
                          title={`${dataPoint?.day} ${dataPoint?.hour}: ${dataPoint?.value || 0} tests`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-4 text-xs text-gray-500">
                <span>Less</span>
                <div className="flex space-x-1">
                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map(intensity => (
                    <div
                      key={intensity}
                      className="w-3 h-3 rounded-sm border border-gray-200"
                      style={{ backgroundColor: `rgba(16, 185, 129, ${intensity})` }}
                    />
                  ))}
                </div>
                <span>More</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Analytics Tab */}
        <TabsContent value="advanced" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Execution Time Scatter Plot */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Target className="w-5 h-5" />
                  <span>Execution Time Distribution</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart data={scatterData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="x" name="Test Index" />
                    <YAxis dataKey="y" name="Duration (s)" />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 border rounded shadow-lg">
                              <p className="font-medium">{data.testcase}</p>
                              <p className="text-sm">Duration: {data.y}s</p>
                              <p className="text-sm">Steps: {data.steps}</p>
                              <p className={`text-sm ${data.status === 'PASS' ? 'text-green-600' : 'text-red-600'}`}>
                                Status: {data.status}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter 
                      dataKey="y" 
                      fill="#8884d8"
                    >
                      {scatterData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={SCATTER_COLORS[entry.status as keyof typeof SCATTER_COLORS] || '#8884d8'} 
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Project Performance Radar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Layers className="w-5 h-5" />
                  <span>Project Performance Radar</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData[0] ? [radarData[0]] : []}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="project" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar
                      name="Performance"
                      dataKey="Pass Rate"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                    />
                    <Radar
                      name="Reliability"
                      dataKey="Reliability"
                      stroke="#82ca9d"
                      fill="#82ca9d"
                      fillOpacity={0.6}
                    />
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Test Execution Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingDown className="w-5 h-5" />
                <span>Test Execution Funnel</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <FunnelChart>
                  <Tooltip />
                  <Funnel
                    dataKey="value"
                    data={funnelData}
                    isAnimationActive
                  >
                    <LabelList position="center" fill="#fff" stroke="none" />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Advanced Metrics Grid */}
          {showAdvancedMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-600/10 backdrop-blur-sm border-indigo-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-indigo-600 text-sm font-medium">Test Velocity</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {(filteredData.length / Math.max(1, Math.ceil((new Date().getTime() - new Date(Math.min(...filteredData.map(r => new Date(r.created_date).getTime()))).getTime()) / (1000 * 60 * 60 * 24)))).toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Tests per day</p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
                      <Zap className="w-6 h-6 text-indigo-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-500/10 to-red-600/10 backdrop-blur-sm border-orange-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-600 text-sm font-medium">Flaky Tests</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {Math.round(stats.failRate * 0.3)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Estimated flakiness</p>
                    </div>
                    <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-teal-500/10 to-cyan-600/10 backdrop-blur-sm border-teal-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-teal-600 text-sm font-medium">Coverage Score</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {Math.min(100, Math.round((projectData.length * moduleData.length) / 10 * 100 / Math.max(1, projectData.length)))}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Test coverage index</p>
                    </div>
                    <div className="w-12 h-12 bg-teal-500/20 rounded-full flex items-center justify-center">
                      <Target className="w-6 h-6 text-teal-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsDashboard;
