import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
// Removed Switch, Label, and RadioGroup imports - no longer needed
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Target, Settings, Shield, RotateCcw, Zap, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/useAuthorization';
import { buildApiUrl } from '@/config/api';
import { testSuiteService as TestSuiteService } from '@/services/testSuiteService';
import PageBackButton from '@/components/ui/page-back-button';
import PhaseStepCard from '@/components/ui/phase-step-card';

// Scrolls the matching execution section into view when a phase card is clicked
const scrollToExecutionSection = (sectionId: string) => {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Removed SuiteType as we're only using created test suites now
 
interface TestCase {
  id: string;
  name: string;
  project: string;
  module: string;
  priority: 'high' | 'medium' | 'low';
  estimated_time: string;
  description?: string;
  suite_type?: string; // Track which phase the test case came from
  sourceSuite?: string; // Track which test suite this test case belongs to
  sourceSuiteName?: string; // Track the name of the source suite
  has_values?: boolean;
  value_sets?: number;
  configured_values?: number;
}

interface TestCaseValueSelection {
  testCaseId: string;
  withValue: boolean | null;
}

interface CreatedTestSuite {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: string;
  testCount: number;
  lastRun: string;
  status: 'active' | 'inactive';
  source: 'api'; // Only API source now
}
 
interface TestExecutionDashboardProps {
  onBack?: () => void;
}

interface LocalExecutionStatus {
  status: 'running' | 'completed' | 'failed';
  mode: 'sequential' | 'parallel';
  totalTests: number;
  completedTests: number;
  activeTests: string[];
  currentTest?: string;
  lastFinishedTest?: string;
  lastUpdated: string;
}

type ExecutorType = 'selenium' | 'playwright' | 'cypress';
interface BrowserOption {
  value: string;
  label: string;
  description: string;
}

const EXECUTOR_BROWSER_OPTIONS: Record<ExecutorType, BrowserOption[]> = {
  selenium: [
    { value: 'chrome', label: 'Chrome', description: 'Best for standard local and server runs' },
    { value: 'firefox', label: 'Firefox', description: 'Useful for Gecko-based compatibility checks' },
    { value: 'edge', label: 'Edge', description: 'Chromium-based Microsoft browser coverage' },
  ],
  playwright: [
    { value: 'chromium', label: 'Chromium', description: 'Fast default engine for Playwright' },
    { value: 'firefox', label: 'Firefox', description: 'Native Playwright Firefox coverage' },
    { value: 'webkit', label: 'WebKit', description: 'Safari-like engine coverage through WebKit' },
  ],
  cypress: [
    { value: 'chrome', label: 'Chrome', description: 'Most stable Cypress browser in this setup' },
    { value: 'edge', label: 'Edge', description: 'Chromium-based alternative for Cypress runs' },
    { value: 'firefox', label: 'Firefox', description: 'Cross-browser validation with Cypress' },
  ],
};

const TestExecutionDashboard: React.FC<TestExecutionDashboardProps> = ({ onBack }) => {
  const [selectedTestCases, setSelectedTestCases] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastExecutionResults, setLastExecutionResults] = useState<any[]>([]);
  const [executionInProgress, setExecutionInProgress] = useState(false);
  const [localExecutionStatus, setLocalExecutionStatus] = useState<LocalExecutionStatus | null>(null);
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorType>('selenium');
  const [selectedBrowser, setSelectedBrowser] = useState<string>('chrome');
  const [enableIsolation, setEnableIsolation] = useState(true);
  const [enableParallelExecution, setEnableParallelExecution] = useState(false);
  const [maxConcurrentTests, setMaxConcurrentTests] = useState(3);

  // State for created test suites
  const [createdTestSuites, setCreatedTestSuites] = useState<CreatedTestSuite[]>([]);
  const [selectedCreatedSuites, setSelectedCreatedSuites] = useState<string[]>([]);
  const [createdSuiteTestCases, setCreatedSuiteTestCases] = useState<any[]>([]);

  // State for test case value selections
  const [testCaseValueSelections, setTestCaseValueSelections] = useState<Map<string, boolean>>(new Map());
  const [testCaseValueMappings, setTestCaseValueMappings] = useState<Map<string, any>>(new Map());
  const suiteLoadRequestRef = useRef(0);

  // State for VNC management
  const [vncStatus, setVncStatus] = useState<any>(null);
  const [isKillingVNC, setIsKillingVNC] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Check authorization for test-lab function
  const { authorized, loading: authLoading, error: authError } = useAuthorization('test-lab');

  const { toast } = useToast();
  
  // Initialize current user email
  useEffect(() => {
    const savedUser = localStorage.getItem('qfast_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUserEmail(user.email);
        // Check VNC status on component mount
        if (user.email) {
          checkVNCStatus(user.email);
        }
      } catch (e) {
        console.error('Error parsing user from localStorage:', e);
      }
    }
  }, []);

  useEffect(() => {
    const supportedBrowsers = EXECUTOR_BROWSER_OPTIONS[selectedExecutor];
    if (!supportedBrowsers.some(option => option.value === selectedBrowser)) {
      setSelectedBrowser(supportedBrowsers[0]?.value || 'chrome');
    }
  }, [selectedBrowser, selectedExecutor]);
 
  // Icon mapping function for created test suites
  const getIconComponent = (iconName: string) => {
    const iconMap: { [key: string]: React.ComponentType<any> } = {
      Zap,
      Shield,
      RotateCcw,
      Settings,
    };
    return iconMap[iconName] || Settings;
  };
 
  // Color palette for different test suites
  const getColorForSuite = (index: number) => {
    const colorPalette = [
      'from-blue-500 to-blue-600',      // Blue
      'from-green-500 to-green-600',    // Green
      'from-purple-500 to-purple-600',  // Purple
      'from-orange-500 to-orange-600',  // Orange
      'from-pink-500 to-pink-600',      // Pink
      'from-indigo-500 to-indigo-600',  // Indigo
      'from-red-500 to-red-600',        // Red
      'from-teal-500 to-teal-600',      // Teal
      'from-yellow-500 to-yellow-600',  // Yellow
      'from-cyan-500 to-cyan-600',      // Cyan
      'from-emerald-500 to-emerald-600', // Emerald
      'from-violet-500 to-violet-600',   // Violet
    ];
    return colorPalette[index % colorPalette.length];
  };
 
  // Get border color for suite
  const getBorderColorForSuite = (index: number) => {
    const borderColors = [
      '#3b82f6', // Blue
      '#10b981', // Green
      '#8b5cf6', // Purple
      '#f97316', // Orange
      '#ec4899', // Pink
      '#6366f1', // Indigo
      '#ef4444', // Red
      '#14b8a6', // Teal
      '#eab308', // Yellow
      '#06b6d4', // Cyan
      '#059669', // Emerald
      '#7c3aed', // Violet
    ];
    return borderColors[index % borderColors.length];
  };

  const fetchTestCaseValueMappings = async (testCaseId: string, testCaseName: string, projectName?: string, moduleName?: string) => {
    try {
      // FIRST: Check if an Excel sheet has been explicitly mapped to this test case
      console.log(`[fetchTestCaseValueMappings] Checking Excel mapping for: "${testCaseName}" (ID: ${testCaseId})`);
      
      const encodedName = encodeURIComponent(testCaseName);
      console.log(`[fetchTestCaseValueMappings] Encoded test case name: "${encodedName}"`);
      
      const mappedExcelResponse = await fetch(buildApiUrl(`/api/testcases/${encodedName}/mapped-excel`), {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      console.log(`[fetchTestCaseValueMappings] API Response Status: ${mappedExcelResponse.status}`);

      if (!mappedExcelResponse.ok) {
        console.log(`[fetchTestCaseValueMappings] ❌ No Excel sheet mapped for test case: "${testCaseName}" (Status: ${mappedExcelResponse.status})`);
        return null;
      }

      const mappedExcelData = await mappedExcelResponse.json();
      const mappedExcelSheet = mappedExcelData.excelSheetName || mappedExcelData.excel_sheet_name;
      const found = mappedExcelData.found !== false;
      const actualDataSets = mappedExcelData.dataSets || 0;
      
      console.log(`[fetchTestCaseValueMappings] API returned: ${JSON.stringify(mappedExcelData)}`);
      
      if (!found || !mappedExcelSheet) {
        console.log(`[fetchTestCaseValueMappings] ❌ Excel sheet name is empty or not found for test case: "${testCaseName}"`);
        console.log(`[fetchTestCaseValueMappings] Backend response - found: ${found}, excelSheetName: "${mappedExcelSheet}"`);
        return null;
      }

      console.log(`[fetchTestCaseValueMappings] ✓ Excel sheet mapped for "${testCaseName}": "${mappedExcelSheet}" with ${actualDataSets} data sets`);

      // SECOND: Check if test case has teststeps with values
      // Build URL with query params if project/module provided to uniquely identify test case
      let stepsUrl = buildApiUrl(`/api/teststeps/${encodeURIComponent(testCaseName)}`);
      if (projectName && moduleName) {
        stepsUrl += `?project_name=${encodeURIComponent(projectName)}&module_name=${encodeURIComponent(moduleName)}`;
        console.log(`[fetchTestCaseValueMappings] Using project/module info: ${projectName}/${moduleName}`);
      }

      const stepsResponse = await fetch(stepsUrl, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!stepsResponse.ok) {
        const errorData = await stepsResponse.json().catch(() => ({}));
        console.log(`[fetchTestCaseValueMappings] ❌ Test steps API error for ${testCaseName}:`, {
          status: stepsResponse.status,
          error: errorData
        });
        return null;
      }

      const steps = await stepsResponse.json();
      
      console.log(`[fetchTestCaseValueMappings] Got steps response for ${testCaseName}:`, { 
        isArray: Array.isArray(steps), 
        type: typeof steps,
        data: steps
      });
      
      // Validate that steps is actually an array
      if (!Array.isArray(steps)) {
        console.log(`[fetchTestCaseValueMappings] ❌ Invalid response - not an array for ${testCaseName}`);
        return null;
      }
      
      const stepsWithValues = steps.filter((step: any) => step.values && step.values.trim() !== '');

      if (stepsWithValues.length === 0) {
        console.log(`[fetchTestCaseValueMappings] No values found in teststeps for test case: ${testCaseName}`);
        return null;
      }

      // Use actual data sets count from Excel file (number of rows)
      const dataSetsCount = actualDataSets;
      
      // Also extract placeholder field names for reference (not for iteration count)
      const placeholderPattern = /\{\{(\w+)\}\}/g;
      const fieldNames = new Set<string>();
      
      for (const step of stepsWithValues) {
        const valuesStr = String(step.values);
        let match;
        while ((match = placeholderPattern.exec(valuesStr)) !== null) {
          fieldNames.add(match[1]);
        }
      }

      console.log(`[fetchTestCaseValueMappings] ✓ VALID: ${testCaseName} has Excel sheet "${mappedExcelSheet}" with ${dataSetsCount} data sets and ${fieldNames.size} fields`, Array.from(fieldNames));

      return {
        excelSheetName: mappedExcelSheet,
        excelValueSets: stepsWithValues.map((step: any) => ({ step_id: step.id, values: step.values })),
        configuredValues: [],
        totalSets: dataSetsCount,
        fieldNames: Array.from(fieldNames)
      };
    } catch (error) {
      console.log(`[fetchTestCaseValueMappings] Error fetching value mappings for ${testCaseName}:`, error);
      return null;
    }
  };

  const hasTestCaseValues = (testCase: any): boolean => {
    // Only show With/Without Value buttons for test cases that have BOTH:
    // 1. has_values = true (Excel sheet is explicitly mapped)
    // 2. value_sets > 0 (Test steps have values with placeholders)
    const hasValuesFlag = testCase.has_values === true;
    const hasValueSets = testCase.value_sets && testCase.value_sets > 0;
    const result = hasValuesFlag && hasValueSets;
    
    if (!result) {
      console.log(`[hasTestCaseValues] ✗ ${testCase.name}: has_values=${hasValuesFlag}, value_sets=${testCase.value_sets} → HIDE buttons`);
    } else {
      console.log(`[hasTestCaseValues] ✓ ${testCase.name}: has_values=${hasValuesFlag}, value_sets=${testCase.value_sets} → SHOW buttons`);
    }
    
    return result;
  };

  const getTestCaseValueCount = (testCase: any): { excel: number; configured: number; total: number } => {
    return {
      excel: testCase.value_sets || 0,
      configured: testCase.configured_values || 0,
      total: (testCase.value_sets || 0) + (testCase.configured_values || 0)
    };
  };

  const handleTestCaseValueSelection = (compoundKey: string, withValue: boolean) => {
    const newSelections = new Map(testCaseValueSelections);
    newSelections.set(compoundKey, withValue);
    setTestCaseValueSelections(newSelections);
  };

  const getSuiteIdFromCompoundKey = (compoundKey: string): string => {
    const separatorIndex = compoundKey.indexOf('-');
    return separatorIndex >= 0 ? compoundKey.slice(separatorIndex + 1) : '';
  };

  const pruneSelectionsForSuites = (suiteIds: string[]) => {
    const allowedSuites = new Set(suiteIds);

    setSelectedTestCases((prev) => prev.filter((compoundKey) => allowedSuites.has(getSuiteIdFromCompoundKey(compoundKey))));
    setTestCaseValueSelections((prev) => {
      const filtered = new Map<string, boolean>();
      prev.forEach((value, compoundKey) => {
        if (allowedSuites.has(getSuiteIdFromCompoundKey(compoundKey))) {
          filtered.set(compoundKey, value);
        }
      });
      return filtered;
    });
    setTestCaseValueMappings((prev) => {
      const filtered = new Map<string, any>();
      prev.forEach((value, compoundKey) => {
        if (allowedSuites.has(getSuiteIdFromCompoundKey(compoundKey))) {
          filtered.set(compoundKey, value);
        }
      });
      return filtered;
    });
  };

  // Helper function to load test cases for multiple selected suites (API only)
  const loadTestCasesForSelectedSuites = async (suiteIds: string[]) => {
    const requestId = ++suiteLoadRequestRef.current;
    pruneSelectionsForSuites(suiteIds);
    setCreatedSuiteTestCases((prev) => prev.filter((testCase) => suiteIds.includes(testCase.sourceSuite)));

    if (suiteIds.length === 0) {
      setCreatedSuiteTestCases([]);
      return;
    }

    try {
      const allTestCases: any[] = [];
      // Parallelize loading of test cases for all selected suites for responsiveness
      const suitePromises = suiteIds.map(async (suiteId) => {
        const suite = createdTestSuites.find(s => s.id === suiteId);
        if (!suite) return [];

        try {
          console.log(`🔄 Loading test cases from API for suite: ${suite.name} (ID: ${suiteId})`);
          const apiTestCases = await TestSuiteService.getTestSuiteTestCases(suiteId);
          console.log(`📦 Raw API test cases for suite ${suite.name}:`, apiTestCases);

          const mapped = apiTestCases.map((tc: any) => ({
            ...tc,
            id: tc.id,
            name: tc.name,
            description: tc.description || '',
            project: tc.project_name || 'Unknown Project',
            module: tc.module_name || 'Unknown Module',
            priority: tc.priority || 'medium',
            estimated_time: tc.estimated_time || '5 min',
            testcase_id: tc.testcase_id,
            project_name: tc.project_name,
            module_name: tc.module_name,
            status: tc.status || 'active'
          }));

          // Attach suite info and default value flags (populate mapping in background)
          return mapped.map((tc: any) => ({
            ...tc,
            sourceSuite: suiteId,
            sourceSuiteName: suite.name,
            // Defaults to no values until background mapping completes
            has_values: false,
            value_sets: 0,
            configured_values: 0,
            excel_sheet_name: ''
          }));
        } catch (apiError) {
          console.error(`❌ Error loading test cases from API for suite ${suiteId}:`, apiError);
          return [];
        }
      });

      const results = await Promise.all(suitePromises);
      for (const arr of results) {
        allTestCases.push(...arr);
      }

      if (requestId !== suiteLoadRequestRef.current) {
        return;
      }

      // Immediately set test cases so UI can render fast
      setCreatedSuiteTestCases(allTestCases);

      // Start background mapping fetch with limited concurrency
      fetchMappingsForTestCasesInBackground(allTestCases, requestId);
     
      console.log('Loaded test cases for suites (initial):', suiteIds, allTestCases);
    } catch (error) {
      console.error('Error loading test cases for suites:', error);
      if (requestId === suiteLoadRequestRef.current) {
        setCreatedSuiteTestCases([]);
      }
    }
  };
 
  useEffect(() => {
    loadCreatedTestSuites();
  }, []);
 
  // Refresh test suites when component becomes visible (e.g., when navigating back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadCreatedTestSuites();
      }
    };
 
    const handleFocus = () => {
      loadCreatedTestSuites();
    };
 
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
 
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (selectedCreatedSuites.length === 0) {
      suiteLoadRequestRef.current += 1;
      setCreatedSuiteTestCases([]);
      setSelectedTestCases([]);
      setTestCaseValueSelections(new Map());
      setTestCaseValueMappings(new Map());
    }
  }, [selectedCreatedSuites]);
 
  const loadCreatedTestSuites = async () => {
    try {
      console.log('🚀 loadCreatedTestSuites called - API only mode');
      setIsLoading(true);
     
      let apiSuites: CreatedTestSuite[] = [];
     
      // Load from API (custom test suites) - ONLY SOURCE
      try {
        console.log('🔄 Loading test suites from API...');
        const apiSuites_raw = await TestSuiteService.getAllTestSuites();
        console.log('📦 Raw API response:', apiSuites_raw);
       
        apiSuites = apiSuites_raw.map((suite: any) => ({
          id: suite.id,
          name: suite.name,
          description: suite.description || '',
          icon: suite.icon || 'Settings',
          gradient: suite.gradient || 'from-gray-500 to-slate-500',
          testCount: suite.testCount || 0,
          lastRun: suite.lastRun || 'Never',
          status: suite.status || 'active',
          source: 'api' // Add source flag
        }));
        console.log('✅ Successfully loaded API test suites:', apiSuites);
      } catch (apiError) {
        console.error('❌ Error loading API test suites:', apiError);
        console.error('Error details:', {
          message: apiError.message,
          stack: apiError.stack
        });
        // Set empty array if API fails
        apiSuites = [];
      }
     
      console.log('✅ Final test suites (API only):', apiSuites);
      setCreatedTestSuites(apiSuites);
       
      // Handle suite selection after loading
      if (apiSuites.length > 0) {
        // Check if currently selected suites still exist
        const currentlySelected = selectedCreatedSuites;
        const validSelectedSuites = currentlySelected.filter(suiteId =>
          apiSuites.some(suite => suite.id === suiteId)
        );
       
        // Only keep valid selected suites, don't auto-select any suite
        setSelectedCreatedSuites(validSelectedSuites);
       
        // Load test cases only if there are valid selected suites
        if (validSelectedSuites.length > 0) {
          await loadTestCasesForSelectedSuites(validSelectedSuites);
        } else {
          // Clear test cases if no suites are selected
          suiteLoadRequestRef.current += 1;
          setCreatedSuiteTestCases([]);
          pruneSelectionsForSuites([]);
        }
      } else {
        // No suites available, clear selection
        suiteLoadRequestRef.current += 1;
        setSelectedCreatedSuites([]);
        setCreatedSuiteTestCases([]);
        pruneSelectionsForSuites([]);
      }
    } catch (error) {
      console.error('Error loading created test suites:', error);
    } finally {
      setIsLoading(false);
    }
  };
 
  // Removed loadTestCases function - only using created test suites now
 
  // Removed default suite handlers - only using created test suites now
 
  const handleTestCaseSelect = (compoundKey: string, isSelected: boolean) => {
    // For test execution, we allow selecting the same testcase from multiple suites
    // since each selection represents running that test in a different suite context
    // The compoundKey format is: "testCaseId-sourceSuite"
    setSelectedTestCases(prev => {
      if (isSelected) {
        return prev.includes(compoundKey) ? prev : [...prev, compoundKey];
      } else {
        return prev.filter(id => id !== compoundKey);
      }
    });
  };
 
  const handleSelectAll = () => {
    const currentCompoundIds = createdSuiteTestCases
      .filter(tc => selectedCreatedSuites.includes(tc.sourceSuite))
      .map(tc => `${tc.id.toString()}-${tc.sourceSuite}`);

    if (selectedTestCases.filter(compoundKey => selectedCreatedSuites.includes(getSuiteIdFromCompoundKey(compoundKey))).length === currentCompoundIds.length) {
      // Deselect all
      setSelectedTestCases(prev => prev.filter(compoundKey => !selectedCreatedSuites.includes(getSuiteIdFromCompoundKey(compoundKey))));
    } else {
      // Select all - this allows selecting the same testcase from multiple suites
      setSelectedTestCases(prev => {
        const outsideVisibleSuites = prev.filter(compoundKey => !selectedCreatedSuites.includes(getSuiteIdFromCompoundKey(compoundKey)));
        return [...outsideVisibleSuites, ...currentCompoundIds];
      });
    }
  };
 
  const handleCreatedSuiteSelect = (suiteId: string, isSelected: boolean) => {
    let newSelectedSuites: string[];

    if (isSelected) {
      // Add suite to selection
      newSelectedSuites = [...selectedCreatedSuites, suiteId];
    } else {
      // Remove suite from selection
      newSelectedSuites = selectedCreatedSuites.filter(id => id !== suiteId);
    }

    setSelectedCreatedSuites(newSelectedSuites);

    // Load test cases for all selected suites
    loadTestCasesForSelectedSuites(newSelectedSuites);
  };
 
  const handleSelectAllSuites = () => {
    const allSuiteIds = createdTestSuites.map(suite => suite.id);

    if (selectedCreatedSuites.length === allSuiteIds.length) {
      // Deselect all suites
      suiteLoadRequestRef.current += 1;
      setSelectedCreatedSuites([]);
      setCreatedSuiteTestCases([]);
      pruneSelectionsForSuites([]);
    } else {
      // Select all suites
      setSelectedCreatedSuites(allSuiteIds);
      pruneSelectionsForSuites(allSuiteIds);
      loadTestCasesForSelectedSuites(allSuiteIds);
    }
  };

  const expandTestCasesWithValues = (testCases: any[]) => {
    const expandedTestCases: any[] = [];

    for (const testCase of testCases) {
      const compoundKey = `${testCase.id.toString()}-${testCase.sourceSuite}`;
      const valueSelection = testCaseValueSelections.get(compoundKey);
      const valueCounts = getTestCaseValueCount(testCase);

      if (valueSelection === true && valueCounts.excel > 0) {
        // Execution 1: always run once with values already configured in test steps.
        expandedTestCases.push({
          ...testCase,
          executionMode: 'without_value',
          originalTestCaseId: testCase.id,
          iterationName: 'Configured'
        });

        // Execution 2..N: each Excel column is one full value set (rows map to test steps).
        for (let i = 0; i < valueCounts.excel; i++) {
          expandedTestCases.push({
            ...testCase,
            valueSetIndex: i,
            columnIndex: i,
            executionMode: 'with_value',
            originalTestCaseId: testCase.id,
            iterationName: `Column ${i + 1}`
          });
        }
      } else {
        // Default to without_value mode - execute with configured values only, NO Excel values
        // This handles: valueSelection === false, null, or undefined (no button clicked)
        expandedTestCases.push({
          ...testCase,
          executionMode: 'without_value'
        });
      }
    }

    return expandedTestCases;
  };

  // Background fetcher for Excel mappings with limited concurrency
  const fetchMappingsForTestCasesInBackground = async (testCases: any[], requestId: number) => {
    const concurrency = 5;
    let idx = 0;

    const worker = async () => {
      while (true) {
        if (requestId !== suiteLoadRequestRef.current) return;
        let i: number;
        // fetch next index atomically
        if (idx >= testCases.length) return;
        i = idx;
        idx += 1;

        const tc = testCases[i];
        if (!tc) continue;

        try {
          const vm = await fetchTestCaseValueMappings(tc.id.toString(), tc.name, tc.project_name, tc.module_name);
          if (requestId !== suiteLoadRequestRef.current) {
            return;
          }
          if (vm) {
            const totalSets = vm.totalSets || (Array.isArray(vm.excelValueSets) ? vm.excelValueSets.length : 0);
            // Update single testcase entry in state
            setCreatedSuiteTestCases(prev => prev.map(p => {
              if (p.id === tc.id && p.sourceSuite === tc.sourceSuite) {
                return {
                  ...p,
                  has_values: totalSets > 0,
                  value_sets: totalSets,
                  configured_values: vm.configuredValues ? vm.configuredValues.length : 0,
                  excel_sheet_name: vm.excelSheetName || ''
                };
              }
              return p;
            }));

            // Cache mapping
            setTestCaseValueMappings(prev => {
              const copy = new Map(prev);
              copy.set(`${tc.id}-${tc.sourceSuite}`, vm);
              return copy;
            });

            console.log(`[BackgroundMapping] Populated mapping for ${tc.name}: ${totalSets} sets`);
          }
        } catch (err) {
          console.warn(`[BackgroundMapping] Error fetching mapping for ${tc.name}:`, err);
        }
      }
    };

    // Launch workers
    const workers = [];
    for (let w = 0; w < concurrency; w++) workers.push(worker());
    await Promise.all(workers);
    console.log('[BackgroundMapping] Completed background mapping fetch');
  };

  const syncLocalExecutionStatus = (
    nextStatus: LocalExecutionStatus | null | ((previous: LocalExecutionStatus | null) => LocalExecutionStatus | null)
  ) => {
    setLocalExecutionStatus(previous => {
      const resolvedStatus = typeof nextStatus === 'function' ? nextStatus(previous) : nextStatus;

      try {
        if (resolvedStatus && resolvedStatus.status === 'running') {
          localStorage.setItem('activeLocalExecution', JSON.stringify(resolvedStatus));
        } else {
          localStorage.removeItem('activeLocalExecution');
        }
      } catch (storageError) {
        console.error('Failed to sync local execution status:', storageError);
      }

      window.dispatchEvent(new CustomEvent('localExecutionProgress', {
        detail: resolvedStatus
      }));

      return resolvedStatus;
    });
  };

  const runLocalTestCaseWithProgress = async (
    testCase: any,
    testIndex: number,
    totalTests: number,
    selectedSuites: any[],
    headless: boolean = true
  ) => {
    const testName = testCase.name || `Test ${testIndex + 1}`;

    syncLocalExecutionStatus(previous => ({
      status: 'running',
      mode: enableParallelExecution ? 'parallel' : 'sequential',
      totalTests,
      completedTests: previous?.completedTests || 0,
      activeTests: Array.from(new Set([...(previous?.activeTests || []), testName])),
      currentTest: enableParallelExecution ? undefined : testName,
      lastFinishedTest: previous?.lastFinishedTest,
      lastUpdated: new Date().toISOString()
    }));

    const singleResult = await executeSingleTestCase(testCase, testIndex, totalTests, selectedSuites, headless);

    syncLocalExecutionStatus(previous => {
      const completedTests = Math.min((previous?.completedTests || 0) + 1, totalTests);
      const activeTests = (previous?.activeTests || []).filter(name => name !== testName);
      const allDone = completedTests >= totalTests;

      return {
        status: allDone ? 'completed' : 'running',
        mode: enableParallelExecution ? 'parallel' : 'sequential',
        totalTests,
        completedTests,
        activeTests,
        currentTest: enableParallelExecution ? undefined : activeTests[0],
        lastFinishedTest: testName,
        lastUpdated: new Date().toISOString()
      };
    });

    return singleResult;
  };

  // Helper function to execute a single test case
  const executeSingleTestCase = async (testCase: any, testIndex: number, totalTests: number, selectedSuites: any[], headless: boolean = true) => {
    try {
      console.log(`🚀 Executing test case ${testIndex + 1}/${totalTests}: ${testCase.name}`);

      // Get current user email from localStorage
      const savedUser = localStorage.getItem('qfast_user');
      const userEmail = savedUser ? JSON.parse(savedUser).email : null;

      // Call the backend API to execute the test case
      const sourceSuite = selectedSuites.find(s => s.id === testCase.sourceSuite);
      const suiteTypeToUse = sourceSuite?.name || testCase.sourceSuiteName || 'general';
      const suitesToSend = [suiteTypeToUse];

      // Create an AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      try {
        const response = await fetch(buildApiUrl(`/api/execute/${encodeURIComponent(testCase.name)}`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(userEmail && { 'X-User-Email': userEmail }),
          },
          signal: controller.signal,
          body: JSON.stringify({
            suite_type: suiteTypeToUse,
            suite_types: suitesToSend,
            test_mode: suiteTypeToUse,
            testsuitename: suiteTypeToUse,
            testcase_id: testCase.id,
            testcase_name: testCase.name,
            project: testCase.project || testCase.project_name,
            module: testCase.module || testCase.module_name,
            created_suite_id: testCase.sourceSuite,
            save_results: true,
            return_results: true,
            headless: headless,
            server_execution: false,
            auto_open_browser: false,
            wait_for_completion: true,
            force_save: true,
            ui_execution: true,
            executor_type: selectedExecutor,
            browser_name: selectedBrowser,
            enable_isolation: enableIsolation,
            execution_mode: testCase.executionMode || 'default',
            value_set_index: testCase.valueSetIndex !== undefined ? testCase.valueSetIndex : null,
            with_values: testCase.executionMode === 'with_value'
          })
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        console.log(`📋 Raw API response for "${testCase.name}":`, {
          status: response.status,
          ok: response.ok,
          result: result
        });
        
        if (response.ok) {
          if (result.success) {
            // Check if this is a multi-suite execution
            if (result.multi_suite_execution) {
              console.log(`✅ Multi-suite execution for "${testCase.name}" completed:`, result);
              
              const executionResults = [];
              let testCaseSuccessCount = 0;
              let testCaseFailureCount = 0;
              
              // Process each suite result
              for (const suiteResult of result.suite_results) {
                const suiteStatus = String(
                  suiteResult.status || suiteResult.result?.status || (suiteResult.success ? 'PASS' : 'FAIL')
                ).toUpperCase();

                if (suiteStatus === 'PASS') {
                  testCaseSuccessCount++;
                } else if (suiteStatus === 'FAIL') {
                  testCaseFailureCount++;
                }
                
                // Extract error message for failed suite results
                let suiteErrorMessage = undefined;
                if (suiteStatus !== 'PASS') {
                  if (suiteResult.result && typeof suiteResult.result === 'object') {
                    suiteErrorMessage = suiteResult.result.error || suiteResult.result.message || suiteResult.result.errorMessage || 'Suite execution failed';
                  } else if (typeof suiteResult.result === 'string') {
                    suiteErrorMessage = suiteResult.result;
                  } else {
                    suiteErrorMessage = 'Unknown suite execution error';
                  }
                }
                
                executionResults.push({
                  testCase: `${testCase.name} (${suiteResult.suite_type})`,
                  status: suiteStatus,
                  suite_type: suiteResult.suite_type,
                  result: suiteResult.result,
                  execution_id: suiteResult.execution_id || result.execution_id,
                  testrun_id: suiteResult.testrun_id || result.testrun_id,
                  error: suiteErrorMessage
                });
              }
              
              console.log(`📊 Multi-suite results for "${testCase.name}": ${testCaseSuccessCount} passed, ${testCaseFailureCount} failed`);
              return { 
                success: true, 
                results: executionResults, 
                successCount: testCaseSuccessCount, 
                failureCount: testCaseFailureCount 
              };
            } else {
              // Single suite execution
              console.log(`✅ Test case "${testCase.name}" executed successfully:`, result);
              
              const executionStatus = String(result.status || (result.success ? 'PASS' : 'FAIL')).toUpperCase();
              const executionResult = {
                testCase: testCase.name,
                status: executionStatus,
                result: result,
                execution_id: result.execution_id,
                testrun_id: result.testrun_id,
                result_id: result.result_id
              };
              
              return { 
                success: executionStatus !== 'FAIL', 
                results: [executionResult], 
                successCount: executionStatus === 'PASS' ? 1 : 0, 
                failureCount: executionStatus === 'FAIL' ? 1 : 0 
              };
            }
          } else {
            // Response is OK but result.success is false - this is a test failure
            let errorMessage = 'Test execution failed';
            if (result && typeof result === 'object') {
              errorMessage = result.error || result.message || result.errorMessage || 'Test execution failed';
            } else if (typeof result === 'string') {
              errorMessage = result;
            }
            
            console.error(`❌ Test case "${testCase.name}" execution failed (success=false):`, {
              error: errorMessage,
              fullResult: JSON.stringify(result, null, 2)
            });
            
            const normalizedStatus = String(result?.status || 'FAIL').toUpperCase();
            const executionResult = {
              testCase: testCase.name,
              status: normalizedStatus === 'PARTIAL_PASS' ? 'PARTIAL_PASS' : 'FAIL',
              error: errorMessage,
              result: result
            };
            
            return { 
              success: normalizedStatus !== 'FAIL', 
              results: [executionResult], 
              successCount: normalizedStatus === 'PASS' ? 1 : 0, 
              failureCount: normalizedStatus === 'FAIL' ? 1 : 0 
            };
          }
        } else {
          // Extract error message from result object
          let errorMessage = 'Unknown error';
          if (result && typeof result === 'object') {
            errorMessage = result.error || result.message || result.errorMessage || 'Test execution failed';
          } else if (typeof result === 'string') {
            errorMessage = result;
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          
          console.error(`❌ Test case "${testCase.name}" failed with HTTP error:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorMessage
          });
          
          const executionResult = {
            testCase: testCase.name,
            status: 'FAIL',
            error: errorMessage,
            result: result
          };
          
          return { 
            success: false, 
            results: [executionResult], 
            successCount: 0, 
            failureCount: 1 
          };
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error(`❌ Network/fetch error for test case "${testCase.name}":`, fetchError);
        
        let errorMessage = 'Network or execution error';
        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            errorMessage = 'Test execution timed out (5 minutes). The test may still be running in the background.';
          } else if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('ERR_CONNECTION_RESET')) {
            errorMessage = `Connection to backend server failed. Please check if the API is running at ${buildApiUrl('')}.`;
          } else {
            errorMessage = fetchError.message;
          }
        }
        
        const executionResult = {
          testCase: testCase.name,
          status: 'ERROR',
          error: errorMessage
        };
        
        return { 
          success: false, 
          results: [executionResult], 
          successCount: 0, 
          failureCount: 1 
        };
      }
    } catch (error) {
      console.error(`❌ Unexpected error executing test case "${testCase.name}":`, error);
      
      const executionResult = {
        testCase: testCase.name,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unexpected error'
      };
      
      return { 
        success: false, 
        results: [executionResult], 
        successCount: 0, 
        failureCount: 1 
      };
    }
  };

  // Helper function to execute tests in parallel batches
  const executeTestsInParallel = async (testCases: any[], selectedSuites: any[], maxConcurrent: number) => {
    const allResults: any[] = [];
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    // Process tests in batches
    for (let i = 0; i < testCases.length; i += maxConcurrent) {
      const batch = testCases.slice(i, i + maxConcurrent);
      console.log(`🔄 Executing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(testCases.length / maxConcurrent)} with ${batch.length} tests`);

      // Update progress toast
      toast({
        title: "Local Parallel Execution In Progress",
        description: `Executing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(testCases.length / maxConcurrent)} (${batch.length} tests concurrently)`,
      });

      // Execute all tests in the current batch concurrently
      const batchPromises = batch.map((testCase, index) =>
        runLocalTestCaseWithProgress(testCase, i + index, testCases.length, selectedSuites, false)
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);

        // Process batch results
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            allResults.push(...result.value.results);
            totalSuccessCount += result.value.successCount;
            totalFailureCount += result.value.failureCount;
          } else if (result.status === 'rejected') {
            console.error('❌ Batch execution promise rejected:', result.reason);
            allResults.push({
              testCase: 'Unknown',
              status: 'ERROR',
              error: result.reason instanceof Error ? result.reason.message : 'Promise rejected'
            });
            totalFailureCount++;
          }
        }

        console.log(`✅ Batch ${Math.floor(i / maxConcurrent) + 1} completed: ${batch.length} tests processed`);
      } catch (error) {
        console.error(`❌ Error in batch ${Math.floor(i / maxConcurrent) + 1}:`, error);
        // Add error results for the entire batch
        for (const testCase of batch) {
          allResults.push({
            testCase: testCase.name,
            status: 'ERROR',
            error: 'Batch execution failed'
          });
          totalFailureCount++;
        }
      }
    }

    return {
      results: allResults,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount
    };
  };

  const checkVNCStatus = async (userEmail: string) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/vnc/status/${encodeURIComponent(userEmail)}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      
      if (response.ok) {
        const status = await response.json();
        setVncStatus(status);
      }
    } catch (error) {
      console.error('Error checking VNC status:', error);
    }
  };

  const normalizeServerExecutionResults = (results: any[], executionId: string) => {
    return (results || []).map((result: any) => {
      const finalStatus = String(result.overall_status || result.status || 'FAIL').toUpperCase();
      const mappedStatus = finalStatus === 'PASS' ? 'PASS' : 'FAIL';
      return {
        testCase: result.testcase_name || result.testCase || 'Unknown Test',
        status: mappedStatus,
        result,
        execution_id: result.execution_id || executionId,
        testrun_id: result.testrun_id,
        result_id: result.result_id,
        error: mappedStatus === 'FAIL' ? (result.error || result.error_message || result.message) : undefined
      };
    });
  };

  const monitorServerExecution = async (executionId: string) => {
    const pollIntervalMs = 5000;
    const maxAttempts = 180; // 15 minutes

    const savedUser = localStorage.getItem('qfast_user');
    const userEmail = savedUser ? JSON.parse(savedUser).email : null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const statusResponse = await fetch(
          buildApiUrl(`/api/execute/server/status/${encodeURIComponent(executionId)}`),
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(userEmail && { 'X-User-Email': userEmail }),
            }
          }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const status = String(statusData?.status || '').toLowerCase();

          if (status === 'completed') {
            const serverResults = normalizeServerExecutionResults(statusData.results || [], executionId);
            const passedCount = serverResults.filter(r => r.status === 'PASS').length;
            const failedCount = serverResults.filter(r => r.status === 'FAIL').length;

            setLastExecutionResults(serverResults);

            try {
              const existingResults = JSON.parse(localStorage.getItem('recentExecutionResults') || '[]');
              const retainedResults = existingResults.filter((item: any) => item.execution_id !== executionId);
              const executionBatch = Date.now();
              const completionResults = serverResults.map(result => ({
                ...result,
                timestamp: new Date().toISOString(),
                executionBatch,
                executionMode: 'server'
              }));
              const updatedResults = [...completionResults, ...retainedResults].slice(0, 100);
              localStorage.setItem('recentExecutionResults', JSON.stringify(updatedResults));
            } catch (storageError) {
              console.error('Failed to update server execution results in localStorage:', storageError);
            }

            toast({
              title: "Server Execution Completed",
              description: `${passedCount} passed, ${failedCount} failed. Check Test Results for detailed reports.`,
            });

            window.dispatchEvent(new CustomEvent('testExecutionCompleted', {
              detail: {
                results: serverResults,
                timestamp: new Date().toISOString(),
                executionMode: 'server',
                execution_id: executionId
              }
            }));
            return;
          }

          if (status === 'failed') {
            const errorMessage = statusData?.error || 'Server execution failed';
            toast({
              title: "Server Execution Failed",
              description: `${errorMessage}. Check Test Results/Monitor for details.`,
              variant: "destructive"
            });

            window.dispatchEvent(new CustomEvent('testExecutionCompleted', {
              detail: {
                results: [],
                timestamp: new Date().toISOString(),
                executionMode: 'server',
                execution_id: executionId,
                error: errorMessage
              }
            }));
            return;
          }
        } else if (statusResponse.status !== 404) {
          console.warn(`[SERVER_POLL] Status API returned ${statusResponse.status} for execution ${executionId}`);
        }
      } catch (pollError) {
        console.warn(`[SERVER_POLL] Error checking status for execution ${executionId}:`, pollError);
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    toast({
      title: "Server Execution Still Running",
      description: "Execution is still in progress. Check Monitor/Test Results in a few minutes.",
      variant: "default"
    });
  };

  const handleKillVNC = async () => {
    if (!currentUserEmail) {
      toast({
        title: "Error",
        description: "User email not found",
        variant: "destructive"
      });
      return;
    }

    setIsKillingVNC(true);
    try {
      const response = await fetch(
        buildApiUrl(`/api/vnc/cleanup/${encodeURIComponent(currentUserEmail)}`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        const sessionsTerminated = data.sessions_terminated ?? 0;
        toast({
          title: "VNC Terminated",
          description: sessionsTerminated > 0
            ? `Killed ${sessionsTerminated} VNC session(s) for ${currentUserEmail}`
            : `VNC cleaned for ${currentUserEmail}`,
          variant: "default"
        });
        setVncStatus(null);
        setTimeout(() => checkVNCStatus(currentUserEmail), 1000);
      } else {
        toast({
          title: "Info",
          description: data.message || 'No active VNC session to kill',
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Error killing VNC:', error);
      toast({
        title: "Error",
        description: "Failed to kill VNC session",
        variant: "destructive"
      });
    } finally {
      setIsKillingVNC(false);
    }
  };

  const handleServerExecution = async () => {
    if (selectedCreatedSuites.length === 0) {
      toast({
        title: "No Suite Selected",
        description: "Please select at least one test suite to execute",
        variant: "destructive"
      });
      return;
    }

    if (selectedTestCases.length === 0) {
      toast({
        title: "No Tests Selected",
        description: "Please select at least one test case to execute",
        variant: "destructive"
      });
      return;
    }

    // Prevent multiple simultaneous executions
    if (executionInProgress) {
      toast({
        title: "Execution In Progress",
        description: "Please wait for the current execution to complete",
        variant: "destructive"
      });
      return;
    }

    setIsExecuting(true);
    setExecutionInProgress(true);
    setLastExecutionResults([]);

    try {
      // First, check if backend is accessible
      console.log('🔍 Checking backend connectivity...');
      try {
        const healthResponse = await fetch(buildApiUrl('/api/health'), {
          method: 'GET',
          signal: AbortSignal.timeout(10000) // 10 second timeout for health check
        });

        if (!healthResponse.ok) {
          throw new Error(`Backend health check failed: ${healthResponse.status}`);
        }

        const healthData = await healthResponse.json();
        console.log('✅ Backend is accessible:', healthData);
      } catch (healthError) {
        console.error('❌ Backend connectivity check failed:', healthError);
        toast({
          title: "Backend Connection Failed",
          description: `Cannot connect to the backend server at ${buildApiUrl('')}. Please ensure the .NET API is running.`,
          variant: "destructive"
        });
        setIsExecuting(false);
        setExecutionInProgress(false);
        return;
      }

      const selectedSuites = createdTestSuites.filter(s => selectedCreatedSuites.includes(s.id));
      const suiteNames = selectedSuites.map(s => s.name).join(', ');
      const currentTestCases = createdSuiteTestCases;

      toast({
        title: "Server Execution Started",
        description: `Executing ${selectedTestCases.length} test cases from ${selectedCreatedSuites.length} suite(s): ${suiteNames} using ${selectedExecutor.toUpperCase()} on ${selectedBrowser.toUpperCase()}`,
      });

      console.log('🚀 Starting server test execution with configuration:', {
        selectedTestCases: selectedTestCases,
        selectedSuites: selectedCreatedSuites,
        suiteNames: suiteNames,
        totalTestCases: currentTestCases.length,
        executor: selectedExecutor,
        browser: selectedBrowser,
        isolationMode: enableIsolation,
        parallelExecution: enableParallelExecution,
        maxConcurrentTests: maxConcurrentTests
      });

      // Get the test cases to execute - need to extract original testcase IDs from compound keys and add suite_type
      const testCasesToExecute = selectedTestCases
        .map(compoundKey => {
          const [testCaseId, sourceSuiteId] = compoundKey.split('-');
          const testCase = currentTestCases.find(tc => tc.id.toString() === testCaseId);
          if (testCase && sourceSuiteId) {
            const sourceSuite = selectedSuites.find(s => s.id === sourceSuiteId);
            return {
              ...testCase,
              suite_type: sourceSuite?.name || testCase.sourceSuiteName || 'regression'
            };
          }
          return testCase;
        })
        .filter(tc => tc !== undefined);

      if (testCasesToExecute.length === 0) {
        toast({
          title: "No Valid Test Cases",
          description: "No valid test cases found to execute",
          variant: "destructive"
        });
        setIsExecuting(false);
        setExecutionInProgress(false);
        return;
      }

      const expandedTestCases = expandTestCasesWithValues(testCasesToExecute);
      const totalIterations = expandedTestCases.length;

      syncLocalExecutionStatus({
        status: 'running',
        mode: enableParallelExecution ? 'parallel' : 'sequential',
        totalTests: totalIterations,
        completedTests: 0,
        activeTests: [],
        currentTest: enableParallelExecution ? undefined : expandedTestCases[0]?.name,
        lastUpdated: new Date().toISOString()
      });

      window.dispatchEvent(new CustomEvent('localExecutionStarted', {
        detail: {
          executionMode: 'local',
          testCases: testCasesToExecute,
          expandedTestCases,
          selectedSuites,
          executor: selectedExecutor,
          browser: selectedBrowser,
          parallelExecution: enableParallelExecution,
          timestamp: new Date().toISOString()
        }
      }));

      console.log('📊 Test case expansion:', {
        originalCount: testCasesToExecute.length,
        expandedCount: expandedTestCases.length,
        totalIterations: totalIterations
      });

      // Get current user email from localStorage
      const savedUser = localStorage.getItem('qfast_user');
      const userEmail = savedUser ? JSON.parse(savedUser).email : null;

      // Start server execution with live streaming
      const response = await fetch(buildApiUrl('/api/execute/server'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userEmail && { 'X-User-Email': userEmail }),
        },
        body: JSON.stringify({
          test_cases: expandedTestCases,
          selected_suites: selectedSuites,
          executor_type: selectedExecutor,
          browser_name: selectedBrowser,
          enable_isolation: enableIsolation,
          enable_parallel: enableParallelExecution,
          max_concurrent: maxConcurrentTests,
          enable_streaming: true,
          server_execution: true,
          total_iterations: totalIterations
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start server execution');
      }

      const executionData = await response.json();
      console.log('✅ Server execution started:', executionData);

      // Store execution results in localStorage for the Test Results dashboard
      try {
        const existingResults = JSON.parse(localStorage.getItem('recentExecutionResults') || '[]');
        const newResults = [{
          testCase: 'Server Execution Batch',
          status: 'RUNNING',
          execution_id: executionData.execution_id,
          timestamp: new Date().toISOString(),
          executionBatch: Date.now(),
          executionMode: 'server'
        }];
        const updatedResults = [...newResults, ...existingResults].slice(0, 100); // Keep last 100 results
        localStorage.setItem('recentExecutionResults', JSON.stringify(updatedResults));
        console.log('💾 Stored server execution start in localStorage:', newResults);
      } catch (error) {
        console.error('Failed to store execution results:', error);
      }

      // For server execution, open noVNC URL directly if available
      if (executionData.novnc_url || executionData.streams?.length) {
        const openVNC = (url: string) => {
          console.log(`[VNC] Opening live stream: ${url}`);
          window.open(url, "_blank", "noopener,noreferrer");
        };

        const vncFailed = executionData.vnc_status?.vnc_failed || false;
        const executionMode = vncFailed ? "🖥️ Headless" : "🎥 Live Stream";
        const modeIndicator = vncFailed ? " (VNC Failed - Running Headless)" : "";

        if (executionData.novnc_url && !vncFailed) {
          openVNC(executionData.novnc_url);
          
          toast({
            title: "✅ Server Execution Started",
            description: (
              <div className="space-y-2">
                <p>Live stream opened in new tab</p>
                <p className="text-xs text-gray-600">Execution ID: {executionData.execution_id}</p>
                <button
                  onClick={() => {
                    openVNC(executionData.novnc_url);
                  }}
                  className="text-blue-600 underline text-sm hover:text-blue-800"
                >
                  Reopen Live Stream
                </button>
              </div>
            ),
            duration: 7000,
          });
        } else if (vncFailed) {
          toast({
            title: "⚠️ Server Execution Started (Headless)",
            description: (
              <div className="space-y-2">
                <p>VNC connection failed - Running tests in headless mode</p>
                <p className="text-xs text-gray-600">Execution ID: {executionData.execution_id}</p>
                <p className="text-xs text-amber-600 font-medium">Tests will run without live visualization</p>
              </div>
            ),
            duration: 7000,
            variant: "destructive"
          });
        }
        // Handle multi-test execution
        else if (executionData.streams?.length) {
          executionData.streams.forEach((stream: any, index: number) => {
            setTimeout(() => openVNC(stream.url), index * 500);
          });
          
          toast({
            title: "✅ Multi-Test Server Execution Started",
            description: (
              <div className="space-y-2">
                <p>{executionData.streams.length} live streams opened in new tabs</p>
                <p className="text-xs text-gray-600">Execution ID: {executionData.execution_id}</p>
                <button
                  onClick={() => {
                    executionData.streams.forEach((stream: any, index: number) => {
                      setTimeout(() => openVNC(stream.url), index * 500);
                    });
                  }}
                  className="text-blue-600 underline text-sm hover:text-blue-800"
                >
                  Reopen All Streams
                </button>
              </div>
            ),
            duration: 7000,
          });
        }
      } else {
        // No streaming available: trigger event for Monitor component
        window.dispatchEvent(new CustomEvent('serverExecutionStarted', {
          detail: {
            execution_id: executionData.execution_id,
            test_cases: testCasesToExecute,
            selected_suites: selectedSuites,
            timestamp: new Date().toISOString(),
            executionMode: 'server'
          }
        }));

        toast({
          title: "⚠️ Server Execution Started (No Live Stream)",
          description: `Check Monitor dashboard for results. Execution ID: ${executionData.execution_id}`,
        });
      }

      // Reset selections after successful execution start
      setSelectedTestCases([]);

      // Start polling for completion so server mode shows final status like local execution
      monitorServerExecution(executionData.execution_id);

    } catch (error) {
      console.error('❌ Server execution error:', error);
      toast({
        title: "❌ Server Execution Failed",
        description: "Failed to start server execution. Please check console for details.",
        variant: "destructive"
      });
    } finally {
      setIsExecuting(false);
      setExecutionInProgress(false);
    }
  };

  const handleLocalExecution = async () => {
    if (selectedCreatedSuites.length === 0) {
      toast({
        title: "No Suite Selected",
        description: "Please select at least one test suite to execute",
        variant: "destructive"
      });
      return;
    }

    if (selectedTestCases.length === 0) {
      toast({
        title: "No Tests Selected",
        description: "Please select at least one test case to execute",
        variant: "destructive"
      });
      return;
    }

    // Prevent multiple simultaneous executions
    if (executionInProgress) {
      toast({
        title: "Execution In Progress",
        description: "Please wait for the current execution to complete",
        variant: "destructive"
      });
      return;
    }

    setIsExecuting(true);
    setExecutionInProgress(true);
    setLastExecutionResults([]);
    let successCount = 0;
    let failureCount = 0;
    const executionResults: any[] = [];

    try {
      // First, check if backend is accessible
      console.log('🔍 Checking backend connectivity...');
      try {
        const healthResponse = await fetch(buildApiUrl('/api/health'), {
          method: 'GET',
          signal: AbortSignal.timeout(10000) // 10 second timeout for health check
        });

        if (!healthResponse.ok) {
          throw new Error(`Backend health check failed: ${healthResponse.status}`);
        }

        const healthData = await healthResponse.json();
        console.log('✅ Backend is accessible:', healthData);
      } catch (healthError) {
        console.error('❌ Backend connectivity check failed:', healthError);
        toast({
          title: "Backend Connection Failed",
          description: `Cannot connect to the backend server at ${buildApiUrl('')}. Please ensure the .NET API is running.`,
          variant: "destructive"
        });
        setIsExecuting(false);
        setExecutionInProgress(false);
        return;
      }
      const selectedSuites = createdTestSuites.filter(s => selectedCreatedSuites.includes(s.id));
      const suiteNames = selectedSuites.map(s => s.name).join(', ');




      const testCasesDisplay = selectedTestCases.length === 1 ? '1 test case' : `${selectedTestCases.length} test cases`;
      toast({
        title: "Local Execution Started",
        description: `Executing ${testCasesDisplay} from ${selectedCreatedSuites.length} suite(s): ${suiteNames} using ${selectedExecutor.toUpperCase()} on ${selectedBrowser.toUpperCase()}`,
      });

      console.log('🚀 Starting LOCAL test execution with configuration:', {
        selectedTestCases: selectedTestCases,
        selectedSuites: selectedCreatedSuites,
        suiteNames: suiteNames,
        executor: selectedExecutor,
        browser: selectedBrowser,
        isolationMode: enableIsolation,
        parallelExecution: enableParallelExecution,
        maxConcurrentTests: maxConcurrentTests,
        executionMode: 'local' // Explicitly indicate local execution
      });

      // Get the test cases to execute - need to extract original testcase IDs from compound keys and add suite_type
      const testCasesToExecute = selectedTestCases
        .map(compoundKey => {
          const [testCaseId, sourceSuiteId] = compoundKey.split('-');
          const testCase = createdSuiteTestCases.find(tc => tc.id.toString() === testCaseId);
          if (testCase && sourceSuiteId) {
            const sourceSuite = selectedSuites.find(s => s.id === sourceSuiteId);
            return {
              ...testCase,
              suite_type: sourceSuite?.name || testCase.sourceSuiteName || 'regression'
            };
          }
          return testCase;
        })
        .filter(tc => tc !== undefined);

      if (testCasesToExecute.length === 0) {
        toast({
          title: "No Valid Test Cases",
          description: "No valid test cases found to execute",
          variant: "destructive"
        });
        setIsExecuting(false);
        setExecutionInProgress(false);
        return;
      }

      const expandedTestCases = expandTestCasesWithValues(testCasesToExecute);
      const totalIterations = expandedTestCases.length;

      console.log('📊 Test case expansion for local execution:', {
        originalCount: testCasesToExecute.length,
        expandedCount: expandedTestCases.length,
        totalIterations: totalIterations
      });

      let executionResult;

      if (enableParallelExecution) {
        console.log(`🚀 Starting parallel execution with max ${maxConcurrentTests} concurrent tests`);
        executionResult = await executeTestsInParallel(expandedTestCases, selectedSuites, maxConcurrentTests);
      } else {
        console.log('🚀 Starting sequential execution');
        executionResult = { results: [], successCount: 0, failureCount: 0 };

        for (let i = 0; i < expandedTestCases.length; i++) {
          const testCase = expandedTestCases[i];

          toast({
            title: "Local Sequential Execution In Progress",
            description: `Executing test ${i + 1}/${expandedTestCases.length}: ${testCase.name}`,
          });

          const singleResult = await runLocalTestCaseWithProgress(testCase, i, expandedTestCases.length, selectedSuites, false);
          executionResult.results.push(...singleResult.results);
          executionResult.successCount += singleResult.successCount;
          executionResult.failureCount += singleResult.failureCount;
        }
      }

      // Update the main variables with the execution results
      executionResults.push(...executionResult.results);
      successCount = executionResult.successCount;
      failureCount = executionResult.failureCount;
      // Legacy code - keeping for compatibility but will be skipped
      if (false) {
        for (let i = 0; i < selectedTestCases.length; i++) {
        const testCaseId = selectedTestCases[i];
        const testCase = createdSuiteTestCases.find(tc => tc.id.toString() === testCaseId);
       
        if (!testCase) {
          console.error(`Test case with ID ${testCaseId} not found`);
          failureCount++;
          continue;
        }
 
        try {
          console.log(`🚀 Executing test case ${i + 1}/${selectedTestCases.length}: ${testCase.name}`);
         
          // Update toast to show current progress
          toast({
            title: "Test Execution In Progress",
            description: `Executing test ${i + 1}/${selectedTestCases.length}: ${testCase.name}`,
          });

          // Call the backend API to execute the test case using Selenium
          // Use the test case's source suite name
          const sourceSuite = selectedSuites.find(s => s.id === testCase.sourceSuite);
          const suiteTypeToUse = sourceSuite?.name || testCase.sourceSuiteName || 'general';
          const suitesToSend = [suiteTypeToUse];

          // Get current user email from localStorage
          const savedUser = localStorage.getItem('qfast_user');
          const userEmail = savedUser ? JSON.parse(savedUser).email : null;

          // Create an AbortController for timeout handling
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

          try {
            const response = await fetch(buildApiUrl(`/api/execute/${encodeURIComponent(testCase.name)}`), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(userEmail && { 'X-User-Email': userEmail }),
              },
              signal: controller.signal,
              body: JSON.stringify({
                suite_type: suiteTypeToUse,
                suite_types: suitesToSend,
                test_mode: suiteTypeToUse, // Also send as test_mode since backend might be using this field
                testsuitename: suiteTypeToUse, // Also send as testsuitename
                testcase_id: testCase.id,
                testcase_name: testCase.name, // Add testcase name for better tracking
                project: testCase.project || testCase.project_name,
                module: testCase.module || testCase.module_name,
                created_suite_id: testCase.sourceSuite,
                save_results: true, // Explicitly request to save results
                return_results: true, // Request to return execution results
                headless: true, // Run in headless mode to prevent browser opening
                auto_open_browser: false, // Prevent automatic browser opening
                wait_for_completion: true, // Wait for test to complete before returning
                force_save: true, // Force saving results to database
                ui_execution: true, // Indicate this is from UI, not API direct call
                executor_type: selectedExecutor, // Choose between 'selenium' or 'playwright'
                enable_isolation: enableIsolation // Enable/disable isolation mode
              })
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
 
          const result = await response.json();
         
          console.log(`📋 Raw API response for "${testCase.name}":`, {
            status: response.status,
            ok: response.ok,
            result: result
          });
         
          if (response.ok) {
            if (result.success) {
              // Check if this is a multi-suite execution
              if (result.multi_suite_execution) {
                console.log(`✅ Multi-suite execution for "${testCase.name}" completed:`, result);
               
                // Process each suite result
                let testCaseSuccessCount = 0;
                let testCaseFailureCount = 0;
               
                for (const suiteResult of result.suite_results) {
                  const suiteStatus = String(
                    suiteResult.status || suiteResult.result?.status || (suiteResult.success ? 'PASS' : 'FAIL')
                  ).toUpperCase();

                  if (suiteStatus === 'PASS') {
                    testCaseSuccessCount++;
                  } else if (suiteStatus === 'FAIL') {
                    testCaseFailureCount++;
                  }
                 
                  // Extract error message for failed suite results
                  let suiteErrorMessage = undefined;
                  if (suiteStatus !== 'PASS') {
                    if (suiteResult.result && typeof suiteResult.result === 'object') {
                      suiteErrorMessage = suiteResult.result.error || suiteResult.result.message || suiteResult.result.errorMessage || 'Suite execution failed';
                    } else if (typeof suiteResult.result === 'string') {
                      suiteErrorMessage = suiteResult.result;
                    } else {
                      suiteErrorMessage = 'Unknown suite execution error';
                    }
                  }
                 
                  executionResults.push({
                    testCase: `${testCase.name} (${suiteResult.suite_type})`,
                    status: suiteStatus,
                    suite_type: suiteResult.suite_type,
                    result: suiteResult.result,
                    execution_id: suiteResult.execution_id || result.execution_id,
                    testrun_id: suiteResult.testrun_id || result.testrun_id,
                    error: suiteErrorMessage
                  });
                }
               
                // Update overall counters
                successCount += testCaseSuccessCount;
                failureCount += testCaseFailureCount;
               
                console.log(`📊 Multi-suite results for "${testCase.name}": ${testCaseSuccessCount} passed, ${testCaseFailureCount} failed`);
              } else {
                // Single suite execution (existing logic)
                console.log(`✅ Test case "${testCase.name}" executed successfully:`, result);
                const executionStatus = String(result.status || (result.success ? 'PASS' : 'FAIL')).toUpperCase();
                if (executionStatus === 'PASS') {
                  successCount++;
                } else if (executionStatus === 'FAIL') {
                  failureCount++;
                }
                executionResults.push({
                  testCase: testCase.name,
                  status: executionStatus,
                  result: result,
                  execution_id: result.execution_id,
                  testrun_id: result.testrun_id,
                  result_id: result.result_id
                });
              }
             
              // Verify results were saved to database
              if (result.execution_id || result.testrun_id) {
                console.log(`💾 Execution results saved with ID: ${result.execution_id || result.testrun_id}`);
               
                // Verify the results are actually in the database by making a quick check
                try {
                  const verifyResponse = await fetch(buildApiUrl(`/api/results/${testCase.name}`));
                  if (verifyResponse.ok) {
                    const verifyData = await verifyResponse.json();
                    console.log(`✅ Verified results in database for "${testCase.name}":`, verifyData);
                  } else {
                    console.warn(`⚠️ Could not verify results in database for "${testCase.name}"`);
                  }
                } catch (verifyError) {
                  console.error(`❌ Error verifying results for "${testCase.name}":`, verifyError);
                }
              } else {
                console.warn(`⚠️ No execution ID returned for "${testCase.name}" - results may not be saved`);
              }
            } else {
              // Response is OK but result.success is false - this is a test failure
              // Extract error message from result object
              let errorMessage = 'Test execution failed';
              if (result && typeof result === 'object') {
                errorMessage = result.error || result.message || result.errorMessage || 'Test execution failed';
              } else if (typeof result === 'string') {
                errorMessage = result;
              }
              
              console.error(`❌ Test case "${testCase.name}" execution failed (success=false):`, {
                error: errorMessage,
                fullResult: JSON.stringify(result, null, 2)
              });
              failureCount++;
              executionResults.push({
                testCase: testCase.name,
                status: 'FAIL',
                error: errorMessage,
                result: result
              });
            }
          } else {
            // Extract error message from result object
            let errorMessage = 'Unknown error';
            if (result && typeof result === 'object') {
              errorMessage = result.error || result.message || result.errorMessage || 'Test execution failed';
            } else if (typeof result === 'string') {
              errorMessage = result;
            }
            
            console.error(`❌ Test case "${testCase.name}" execution failed:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorMessage,
              fullResult: JSON.stringify(result, null, 2)
            });
            failureCount++;
            executionResults.push({
              testCase: testCase.name,
              status: 'FAIL',
              error: errorMessage,
              result: result
            });
          }
          } catch (fetchError) {
            clearTimeout(timeoutId);
            console.error(`❌ Error executing test case "${testCase.name}":`, fetchError);
            
            let errorMessage = 'Network or execution error';
            if (fetchError instanceof Error) {
              if (fetchError.name === 'AbortError') {
                errorMessage = 'Test execution timed out (5 minutes). The test may still be running in the background.';
              } else if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('ERR_CONNECTION_RESET')) {
                errorMessage = `Connection to backend server failed. Please check if the API is running at ${buildApiUrl('')}.`;
              } else {
                errorMessage = fetchError.message;
              }
            }
            
            failureCount++;
            executionResults.push({
              testCase: testCase.name,
              status: 'ERROR',
              error: errorMessage
            });
          }
        } catch (error) {
          console.error(`❌ Unexpected error executing test case "${testCase.name}":`, error);
          failureCount++;
          executionResults.push({
            testCase: testCase.name,
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unexpected error'
          });
        }
      } // End of for loop
      } // End of legacy code block (if false)
 
      // Show final results
      const totalExecutions = successCount + failureCount;
     
      // Store execution results in localStorage for the Test Results dashboard
      try {
        const existingResults = JSON.parse(localStorage.getItem('recentExecutionResults') || '[]');
        const newResults = executionResults.map(result => ({
          ...result,
          timestamp: new Date().toISOString(),
          executionBatch: Date.now() // Group results from this execution
        }));
        const updatedResults = [...newResults, ...existingResults].slice(0, 100); // Keep last 100 results
        localStorage.setItem('recentExecutionResults', JSON.stringify(updatedResults));
        console.log('💾 Stored local execution results in localStorage:', newResults);
      } catch (error) {
        console.error('Failed to store execution results:', error);
      }
     
      const hasHeadlessExecution = executionResults.some(r => r.vnc_status?.running_headless);
      const headlessIndicator = hasHeadlessExecution ? " 🖥️ (Headless)" : "";

      if (failureCount === 0) {
        toast({
          title: `✅ All Local Tests Passed${headlessIndicator}`,
          description: `Successfully executed ${successCount} test executions using ${selectedExecutor.toUpperCase()} executor. Results saved to database. Check Test Results for detailed reports.`,
        });
      } else if (successCount === 0) {
        toast({
          title: `❌ All Local Tests Failed${headlessIndicator}`,
          description: `${failureCount} test executions failed using ${selectedExecutor.toUpperCase()} executor. Results saved to database. Check Test Results for details.`,
          variant: "destructive"
        });
      } else {
        toast({
          title: `⚠️ Local Mixed Results${headlessIndicator}`,
          description: `${successCount} passed, ${failureCount} failed using ${selectedExecutor.toUpperCase()} executor. Results saved to database. Check Test Results for detailed reports.`,
          variant: "destructive"
        });
      }
 
      // Log execution summary
      console.log('🏁 Local Execution Summary:', {
        selectedTestCases: selectedTestCases.length,
        selectedSuites: selectedCreatedSuites,
        totalExecutions: totalExecutions,
        passed: successCount,
        failed: failureCount,
        executor: selectedExecutor,
        isolationMode: enableIsolation,
        results: executionResults
      });
 
      // Store results for viewing
      setLastExecutionResults(executionResults);
     
      // Reset selections after successful execution
      setSelectedTestCases([]);
     
      // Trigger a refresh of test results and notify Monitor component for local streaming
      window.dispatchEvent(new CustomEvent('testExecutionCompleted', {
        detail: {
          results: executionResults,
          timestamp: new Date().toISOString(),
          executionMode: 'local'
        }
      }));

      syncLocalExecutionStatus({
        status: failureCount > 0 ? 'failed' : 'completed',
        mode: enableParallelExecution ? 'parallel' : 'sequential',
        totalTests: totalIterations,
        completedTests: totalIterations,
        activeTests: [],
        currentTest: undefined,
        lastFinishedTest: executionResults[executionResults.length - 1]?.testCase,
        lastUpdated: new Date().toISOString()
      });
     
    } catch (error) {
      console.error('❌ Local execution error:', error);
      toast({
        title: "❌ Local Execution Failed",
        description: "Failed to execute test cases. Please check console for details.",
        variant: "destructive"
      });
    } finally {
      setIsExecuting(false);
      setExecutionInProgress(false);
    }
  };
 
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'low':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };
 
  const calculateTotalTime = () => {
    return selectedTestCases.reduce((total, tcId) => {
      const testCase = createdSuiteTestCases.find(tc => tc.id.toString() === tcId);
     
      if (testCase) {
        // For created suite test cases, use default 5 minutes if no estimated_time
        const timeStr = testCase.estimated_time || '5 min';
        const minutes = parseInt(timeStr.split(' ')[0]);
        return total + minutes;
      }
      return total;
    }, 0);
  };

  const visibleSuiteTestCases = createdSuiteTestCases.filter((testCase) =>
    selectedCreatedSuites.includes(testCase.sourceSuite)
  );
  const visibleSelectedTestCaseCount = selectedTestCases.filter((compoundKey) =>
    selectedCreatedSuites.includes(getSuiteIdFromCompoundKey(compoundKey))
  ).length;

  // Show loading while checking authorization
  if (authLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <Clock className="w-5 h-5 animate-spin" />
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
            <Clock className="w-5 h-5 animate-spin" />
            <span>Loading test cases...</span>
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
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-gray-900">Test Execution</CardTitle>
                <p className="text-gray-600">Execute test cases from your created test suites</p>
              </div>
            </div>
            <div />
          </div>
        </CardHeader>
      </Card>
 
 
 
      {/* Test Lab phase sub-steps - same card anatomy as the Home phase cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <PhaseStepCard
          icon={Target}
          title="Select Test Suites"
          description="Pick one or more created test suites to load their test cases"
          step="Step 1"
          accent="blue"
          onClick={() => scrollToExecutionSection('execution-suite-selection')}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Selected: {selectedCreatedSuites.length} / {createdTestSuites.length} suite(s)
          </p>
        </PhaseStepCard>
        <PhaseStepCard
          icon={CheckCircle}
          title="Select Test Cases"
          description="Choose the test cases to run from the selected suites"
          step="Step 2"
          accent="emerald"
          disabled={selectedCreatedSuites.length === 0}
          disabledHint="Select a test suite first"
          onClick={() => scrollToExecutionSection('execution-test-cases')}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Selected: {selectedTestCases.length} test case(s)
          </p>
        </PhaseStepCard>
        <PhaseStepCard
          icon={Play}
          title="Configure & Run"
          description="Set executor, browser, parallel mode and trigger the execution"
          step="Step 3"
          accent="orange"
          disabled={selectedTestCases.length === 0}
          disabledHint="Select at least one test case first"
          onClick={() => scrollToExecutionSection('execution-summary')}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Estimated time: {calculateTotalTime()} min
          </p>
        </PhaseStepCard>
      </div>

      {/* Suite Selection */}
      <Card id="execution-suite-selection" className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-gray-900">Test Suite Selection</CardTitle>
              <p className="text-gray-600">Select one or more test suites for execution</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Selected: {selectedCreatedSuites.length} / {createdTestSuites.length}
              </div>
              <Button
                variant="outline"
                onClick={handleSelectAllSuites}
                className="border-blue-200 text-blue-600"
              >
                {selectedCreatedSuites.length === createdTestSuites.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {createdTestSuites.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Settings className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No test suites found.</p>
                <p className="text-sm">Create test suites in the Test Suite Management section first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {createdTestSuites.map((suite, index) => {
                  const IconComponent = getIconComponent(suite.icon);
                  const isSelected = selectedCreatedSuites.includes(suite.id);
                  const suiteColor = getColorForSuite(index);
                  const borderColor = getBorderColorForSuite(index);
                  return (
                    <Card
                      key={suite.id}
                      className={`cursor-pointer transition-all duration-300 border-l-4 ${
                        isSelected
                          ? `bg-gradient-to-br ${suiteColor} ring-2 ring-offset-2 ring-blue-300 border-blue-200`
                          : `bg-white hover:shadow-md border-gray-200`
                      }`}
                      style={{
                        borderLeftColor: borderColor
                      }}
                      onClick={() => handleCreatedSuiteSelect(suite.id, !isSelected)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleCreatedSuiteSelect(suite.id, checked === true)
                            }
                            onClick={(e) => e.stopPropagation()} // Prevent double triggering
                          />
                          <div className={`w-10 h-10 bg-gradient-to-br ${suiteColor} rounded-lg flex items-center justify-center`}>
                            <IconComponent className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{suite.name}</h3>
                            <p className="text-sm text-gray-600">{suite.description}</p>
                            <div className="flex items-center space-x-4 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {suite.testCount} tests
                              </Badge>
                              <Badge variant={suite.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                {suite.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
 
      {/* Test Cases Selection */}
      <Card id="execution-test-cases" className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-gray-900">
                Test Cases - {selectedCreatedSuites.length > 0
                  ? `${selectedCreatedSuites.length} Suite(s) Selected`
                  : 'No Suites Selected'
                }
              </CardTitle>
              <p className="text-gray-600">Select test cases to execute from the selected test suites</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                  Selected: {visibleSelectedTestCaseCount} / {visibleSuiteTestCases.length} (independent per suite)
                </div>
              <Button
                variant="outline"
                onClick={handleSelectAll}
                className="border-blue-200 text-blue-600"
              >
                {visibleSelectedTestCaseCount === visibleSuiteTestCases.length && visibleSuiteTestCases.length > 0 ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {visibleSuiteTestCases.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Target className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {selectedCreatedSuites.length === 0
                    ? "No test suites selected."
                    : "No test cases found in the selected suites."
                  }
                </p>
                <p className="text-sm">
                  {selectedCreatedSuites.length === 0
                    ? "Please select one or more test suites above to view their test cases."
                    : "Add test cases to the selected suites in the Test Suite Management section."
                  }
                </p>
              </div>
            ) : (
              visibleSuiteTestCases.map((testCase) => {
                const compoundKey = `${testCase.id.toString()}-${testCase.sourceSuite}`;
                const hasValues = hasTestCaseValues(testCase);
                const valueCounts = getTestCaseValueCount(testCase);
                const isSelected = selectedTestCases.includes(compoundKey);
                const valueSelection = testCaseValueSelections.get(compoundKey);

                return (
                  <Card key={compoundKey} className="border border-gray-200 hover:border-gray-300 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleTestCaseSelect(compoundKey, checked === true)
                            }
                          />
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <h4 className="font-semibold text-gray-900">{testCase.name}</h4>
                              <Badge className={getPriorityColor(testCase.priority || 'medium')}>
                                {testCase.priority || 'medium'}
                              </Badge>
                              {testCase.sourceSuiteName && (
                                <Badge className="bg-indigo-100 text-indigo-700">
                                  {testCase.sourceSuiteName}
                                </Badge>
                              )}
                              {testCase.suite_type === 'general' && (
                                <Badge className="bg-blue-100 text-blue-700">
                                  Planning/Development
                                </Badge>
                              )}
                              {testCase.suite_type === 'automation' && (
                                <Badge className="bg-purple-100 text-purple-700">
                                  Automation
                                </Badge>
                              )}
                              {testCase.suite_type === 'development' && (
                                <Badge className="bg-green-100 text-green-700">
                                  Development
                                </Badge>
                              )}
                              {hasValues && (
                                <Badge className="bg-emerald-100 text-emerald-700">
                                  {valueCounts.total} Value Set{valueCounts.total !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                              <span><strong>Test Case ID:</strong> {testCase.testcase_id || testCase.test_case_id || testCase.name || testCase.id || 'N/A'}</span>
                              <span><strong>Project:</strong> {testCase.project || testCase.project_name || 'N/A'}</span>
                              <span><strong>Module:</strong> {testCase.module || testCase.module_name || 'N/A'}</span>
                              <span><strong>Duration:</strong> {testCase.estimated_time || testCase.duration || '5 min'}</span>
                            </div>
                            {hasValues && (
                              <div className="flex items-center space-x-2 mt-3">
                                <span className="text-xs font-medium text-gray-600">Execution Mode:</span>
                                <Button
                                  size="sm"
                                  variant={valueSelection === true ? "default" : "outline"}
                                  className={`text-xs ${valueSelection === true ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                  onClick={() => handleTestCaseValueSelection(compoundKey, true)}
                                >
                                  ✓ With Value ({valueCounts.total})
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
 
      {/* Execution Summary & Actions */}
      <Card id="execution-summary" className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">Execution Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Selected Tests</p>
                  <p className="text-xl font-bold text-gray-900">{selectedTestCases.length}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Estimated Time</p>
                  <p className="text-xl font-bold text-gray-900">{calculateTotalTime()} min</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Selected Suites</p>
                  <p className="text-xl font-bold text-gray-900">
                    {selectedCreatedSuites.length > 0
                      ? `${selectedCreatedSuites.length} Suite(s)`
                      : 'None'
                    }
                  </p>
                </div>
              </div>
            </div>
            <div className="ml-8 space-y-4">
              {/* Executor Selection */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Cross-Browser / Cross-Platform Trigger</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Executor Type Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="executor-select" className="text-sm font-medium text-gray-700">
                      Test Executor
                    </Label>
                    <Select value={selectedExecutor} onValueChange={(value: 'selenium' | 'playwright' | 'cypress') => setSelectedExecutor(value)}>
                      <SelectTrigger id="executor-select" className="w-full">
                        <SelectValue placeholder="Select executor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="selenium">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            <span>Selenium WebDriver</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="playwright">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span>Playwright</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="cypress">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                            <span>Cypress</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {selectedExecutor === 'selenium' 
                        ? 'Traditional WebDriver automation framework'
                        : selectedExecutor === 'playwright'
                          ? 'Modern browser automation with better performance'
                          : 'Cypress E2E runner (Node/NPM based)'
                      }
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="browser-select" className="text-sm font-medium text-gray-700">
                      Target Browser
                    </Label>
                    <Select value={selectedBrowser} onValueChange={setSelectedBrowser}>
                      <SelectTrigger id="browser-select" className="w-full">
                        <SelectValue placeholder="Select browser" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXECUTOR_BROWSER_OPTIONS[selectedExecutor].map((browser) => (
                          <SelectItem key={browser.value} value={browser.value}>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                              <span>{browser.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {EXECUTOR_BROWSER_OPTIONS[selectedExecutor].find(option => option.value === selectedBrowser)?.description}
                    </p>
                  </div>

                  {/* Isolation Mode Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="isolation-select" className="text-sm font-medium text-gray-700">
                      Isolation Mode
                    </Label>
                    <Select value={enableIsolation ? 'enabled' : 'disabled'} onValueChange={(value) => setEnableIsolation(value === 'enabled')}>
                      <SelectTrigger id="isolation-select" className="w-full">
                        <SelectValue placeholder="Select isolation mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enabled">
                          <div className="flex items-center space-x-2">
                            <Shield className="w-3 h-3 text-green-500" />
                            <span>Enabled</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="disabled">
                          <div className="flex items-center space-x-2">
                            <Zap className="w-3 h-3 text-orange-500" />
                            <span>Disabled</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {enableIsolation 
                        ? 'Continue execution even if steps fail (recommended)'
                        : 'Stop execution on first failure (faster feedback)'
                      }
                    </p>
                  </div>

                  {/* Parallel Execution Settings */}
                  <div className="space-y-2">
                    <Label htmlFor="parallel-select" className="text-sm font-medium text-gray-700">
                      Execution Mode
                    </Label>
                    <Select value={enableParallelExecution ? 'parallel' : 'sequential'} onValueChange={(value) => setEnableParallelExecution(value === 'parallel')}>
                      <SelectTrigger id="parallel-select" className="w-full">
                        <SelectValue placeholder="Select execution mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sequential">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span>Sequential</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="parallel">
                          <div className="flex items-center space-x-2">
                            <Zap className="w-3 h-3 text-green-500" />
                            <span>Parallel</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {enableParallelExecution 
                        ? 'Execute multiple tests concurrently (faster but uses more resources)'
                        : 'Execute tests one by one (slower but more stable)'
                      }
                    </p>
                  </div>

                  {/* Max Concurrent Tests (only show when parallel is enabled) */}
                  {enableParallelExecution && (
                    <div className="space-y-2">
                      <Label htmlFor="concurrent-select" className="text-sm font-medium text-gray-700">
                        Max Concurrent Tests
                      </Label>
                      <Select value={maxConcurrentTests.toString()} onValueChange={(value) => setMaxConcurrentTests(parseInt(value))}>
                        <SelectTrigger id="concurrent-select" className="w-full">
                          <SelectValue placeholder="Select max concurrent tests" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 Tests</SelectItem>
                          <SelectItem value="3">3 Tests</SelectItem>
                          <SelectItem value="4">4 Tests</SelectItem>
                          <SelectItem value="5">5 Tests</SelectItem>
                          <SelectItem value="6">6 Tests</SelectItem>
                          <SelectItem value="8">8 Tests</SelectItem>
                          <SelectItem value="10">10 Tests</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">
                        Higher values = faster execution but more resource usage
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {/* Execution Mode Display */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">
                    Execution Modes
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium text-blue-700">Local Execution</span>
                    </div>
                    <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-green-700">Server Execution (Direct noVNC)</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Choose Local for fast execution (browser opens directly) or Server for live streaming (redirects to noVNC)
                  </p>
                </div>

                <div className="space-y-2">
                  {localExecutionStatus && (
                    <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
                      <p className="text-sm font-medium text-orange-800">Local Execution Status</p>
                      <p className="mt-1 text-xs text-orange-700">
                        {localExecutionStatus.completedTests}/{localExecutionStatus.totalTests} completed
                        {localExecutionStatus.mode === 'parallel' ? ' in parallel mode' : ' in sequential mode'}
                      </p>
                      {localExecutionStatus.currentTest && (
                        <p className="mt-1 text-xs text-orange-700">
                          Current test: {localExecutionStatus.currentTest}
                        </p>
                      )}
                      {localExecutionStatus.activeTests.length > 0 && (
                        <p className="mt-1 text-xs text-orange-700">
                          Running: {localExecutionStatus.activeTests.join(', ')}
                        </p>
                      )}
                      {localExecutionStatus.lastFinishedTest && (
                        <p className="mt-1 text-xs text-orange-700">
                          Last finished: {localExecutionStatus.lastFinishedTest}
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleLocalExecution}
                    disabled={selectedTestCases.length === 0 || selectedCreatedSuites.length === 0 || isExecuting}
                    className={`w-full ${
                      selectedTestCases.length > 0 && selectedCreatedSuites.length > 0
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-gray-300 cursor-not-allowed'
                    }`}
                    size="lg"
                  >
                    {isExecuting ? (
                      <>
                        <Clock className="w-5 h-5 mr-2 animate-spin" />
                        Executing Locally...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Execute Locally
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleServerExecution}
                    disabled={selectedTestCases.length === 0 || selectedCreatedSuites.length === 0 || isExecuting}
                    className={`w-full ${
                      selectedTestCases.length > 0 && selectedCreatedSuites.length > 0
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-gray-300 cursor-not-allowed'
                    }`}
                    size="lg"
                  >
                    {isExecuting ? (
                      <>
                        <Clock className="w-5 h-5 mr-2 animate-spin" />
                        Starting Server Execution...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Execute on Server (Live Stream)
                      </>
                    )}
                  </Button>

                  {/* VNC Management Section */}
                  {currentUserEmail && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-amber-700">
                            VNC Management
                          </p>
                          <p className="text-xs text-amber-600 mt-1">
                            {vncStatus && vncStatus.has_active_session
                              ? `Active sessions: ${vncStatus.active_session_count ?? 1}`
                              : 'No active VNC session'}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleKillVNC}
                        disabled={isKillingVNC}
                        variant="destructive"
                        size="sm"
                        className="w-full"
                      >
                        {isKillingVNC ? (
                          <>
                            <Clock className="w-4 h-4 mr-2 animate-spin" />
                            Killing VNC...
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-2" />
                            Kill VNC
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
               
                {lastExecutionResults.length > 0 && (
                  <div className="space-y-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => {
                        console.log('Last execution results:', lastExecutionResults);
                        const passedCount = lastExecutionResults.filter(r => r.status === 'PASS').length;
                        const failedCount = lastExecutionResults.filter(r => r.status === 'FAIL').length;
                        toast({
                          title: "Execution Results",
                          description: `Last execution: ${passedCount} passed, ${failedCount} failed. Check console for details.`,
                        });
                      }}
                    >
                      View Last Results ({lastExecutionResults.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-green-600 border-green-200 hover:bg-green-50"
                      onClick={async () => {
                        // Force refresh the test results by triggering the event
                        window.dispatchEvent(new CustomEvent('forceRefreshResults'));
                       
                        // Also try to refresh via API call
                        try {
                          const refreshResponse = await fetch(buildApiUrl('/api/results/refresh'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                          });
                         
                          if (refreshResponse.ok) {
                            toast({
                              title: "Results Refreshed",
                              description: "Test results have been refreshed. Check Test Results section.",
                            });
                          }
                        } catch (error) {
                          console.error('Failed to refresh results:', error);
                        }
                      }}
                    >
                      Refresh Results Database
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
 
export default TestExecutionDashboard;

