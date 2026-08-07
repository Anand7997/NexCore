import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Edit, Trash2, ArrowUp, ArrowDown, PlusCircle, Save, X, RefreshCw, CheckCircle, Copy, FileSpreadsheet, Database, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import useAutoXPathRefresh from '@/hooks/useAutoXPathRefresh';
import ExcelUploadSidebar from './ExcelUploadSidebar';


// Chrome extension type declarations
declare global {
  interface Window {
    chrome: any;
    debugTestSteps?: (steps: any[], source?: string) => void;
  }
}

interface TestStep {
  id: number;
  tc_id: string;
  step_no: number;
  test_step_description: string;
  page?: string; // New: associated page name
  element_name: string;
  action_type: string;
  assertion_type?: string;
  secondary_action?: string;
  secondary_value?: string;
  xpath: string;
  values: string;
}

interface ReusableTestCase {
  id: number;
  testcase_id?: string;
  name: string;
  description?: string;
  priority?: string;
  status?: string;
  suite_type?: string;
  project_name?: string;
  module_name?: string;
}

interface TestStepsGridProps {
  selectedProject?: any;
  selectedModule?: any;
  testSteps: TestStep[];
  onTestStepsChange: (steps: TestStep[]) => void;
  readOnlyMode?: boolean;
  onAutoXPathRefresh?: (steps: TestStep[]) => Promise<void>;
  testCaseName?: string;
}

export interface TestStepsGridRef {
  addNewStep: () => void;
  editStep: (stepId: number) => void;
  triggerXPathRefresh: (change?: {
    old_object_name?: string;
    object_name?: string;
    xpath?: string;
    page_name?: string;
  }) => void;
}

const ACTION_TYPES = [
  'OPEN_BROWSER',
  'CLICK',
  'DOUBLE_CLICK',
  'RIGHT_CLICK',
  'MOUSE_OVER',
  'CLICK_AND_SELECT',
  'CLICK_AND_TYPE',
  'TYPE_AND_SELECT',
  'CLEAR_AND_TYPE',
  'RADIO_BUTTON',
  'DRAG_AND_DROP',
  'SELECT_COUNT',
  'INCREMENT',
  'DECREMENT',
  'HANDLE_CHECKBOX',
  'SWITCH_TO_NEW_WINDOW',
  'SWITCH_TO_WINDOW_BY_INDEX',
  'SWITCH_TO_WINDOW_BY_URL',
  'SWITCH_TO_IFRAME',
  'CLOSE_EXTRA_WINDOWS',
  'NAVIGATE_TO_URL',
  'REFRESH_PAGE',
  'GO_BACK',
  'GO_FORWARD',
  'READ_TEXT',
  'READ_VALUE',
  'READ_TOOLTIP',
  'READ_LABEL',
  'COPY',
  'PASTE',
  'UPLOAD_FILE',
  'DOWNLOAD_FILE',
  'HANDLE',
  'VISUAL_ASSERTION',
  'TYPE',
  'SELECT',
  'WAIT',
  'PRESS_KEY',
  'ASSERTION'
];

const PRESS_KEY_OPTIONS = [
  'ENTER',
  'TAB',
  'SHIFT+TAB',
  'ESCAPE',
  'BACKSPACE',
  'DELETE',
  'ARROW_UP',
  'ARROW_DOWN',
  'ARROW_LEFT',
  'ARROW_RIGHT',
  'CTRL+A',
  'CTRL+C',
  'CTRL+V',
  'CTRL+X',
  'CTRL+Z',
  'CTRL+Y',
];

const ASSERTION_OPTIONS = [
  'ELEMENT_EXISTS',
  'ELEMENT_VISIBLE',
  'ELEMENT_ENABLED',
  'ELEMENT_DISABLED',
  'ELEMENT_CLICKABLE',
  'VERIFY_TEXT',
  'VERIFY_INPUT_VALUE',
  'VERIFY_ATTRIBUTE',
  'VERIFY_PLACEHOLDER',
  'VERIFY_PAGE_TITLE',
  'VERIFY_URL_CONTAINS',
  'VERIFY_URL_EQUALS',
  'VERIFY_PAGE_LOADED',
  'WAIT_FOR_VISIBLE',
  'WAIT_FOR_CLICKABLE',
  'WAIT_FOR_LOADER_DISAPPEARS',
];

const HANDLE_OPTIONS = [
  'HANDLE_ALERT_DIALOG',
  'HANDLE_CONFIRMATION',
  'HANDLE_NOTIFICATION',
  'HANDLE_OS_DIALOG',
];
const SECONDARY_ACTION_OPTIONS = ['', 'LOG_STEP', 'AUTO_GENERATE_VALUE', 'TAKE_SCREENSHOT'];

const LEGACY_TO_CURRENT_ACTION: Record<string, string> = {
  CLICK_AND_SELECT_DATE: 'CLICK_AND_SELECT',
  CLICK_QUICK_DATE: 'CLICK_AND_SELECT',
  CLICK_BUS_QUICK_DATE: 'CLICK_AND_SELECT',
  CLICK_AND_SELECT_AGE: 'CLICK_AND_SELECT',
  DOUBLECLICK: 'DOUBLE_CLICK',
  RIGHTCLICK: 'RIGHT_CLICK',
  MOUSEOVER: 'MOUSE_OVER',
  MOUSE_HOVER: 'MOUSE_OVER',
  HOVER: 'MOUSE_OVER',
  HOVER_MOUSE_OVER: 'MOUSE_OVER',
  CLEAR_TYPE: 'CLEAR_AND_TYPE',
  TYPE_AND_CLEAR: 'CLEAR_AND_TYPE',
  TYPE_SELECT: 'TYPE_AND_SELECT',
  TYPE_AND_PICK: 'TYPE_AND_SELECT',
  RADIO: 'RADIO_BUTTON',
  RADIOBUTTON: 'RADIO_BUTTON',
  HANDLE_RADIO: 'RADIO_BUTTON',
  DRAGDROP: 'DRAG_AND_DROP',
  'DRAG_&_DROP': 'DRAG_AND_DROP',
  HANDLE_ALERT_DIALOG: 'HANDLE',
  HANDLE_CONFIRMATION: 'HANDLE',
  HANDLE_NOTIFICATION: 'HANDLE',
  HANDLE_OS_DIALOG: 'HANDLE',
  HANDLE_ALERT: 'HANDLE_ALERT_DIALOG',
  HANDLE_DIALOG: 'HANDLE_ALERT_DIALOG',
  HANDLE_POPUP: 'HANDLE_ALERT_DIALOG',
  HANDLE_CONFIRM: 'HANDLE_CONFIRMATION',
  HANDLE_CONFIRM_BOX: 'HANDLE_CONFIRMATION',
  HANDLE_CONFIRMATION_BOX: 'HANDLE_CONFIRMATION',
  HANDLE_NOTIFICATION_TOAST: 'HANDLE_NOTIFICATION',
  HANDLE_TOAST: 'HANDLE_NOTIFICATION',
  HANDLE_NOTIFICATIONS: 'HANDLE_NOTIFICATION',
  HANDLE_OS_DIALOGS: 'HANDLE_OS_DIALOG',
  HANDLE_FILE_CHOOSER: 'HANDLE_OS_DIALOG',
  HANDLE_PRINT_DIALOG: 'HANDLE_OS_DIALOG',
  SWITCH_FRAME: 'SWITCH_TO_IFRAME',
  SWITCH_TO_FRAME: 'SWITCH_TO_IFRAME',
  SWITCH_IFRAME: 'SWITCH_TO_IFRAME',
};

const normalizeActionType = (actionType?: string): string => {
  const raw = (actionType || 'CLICK').toUpperCase().trim().replace(/[\s\-/]+/g, '_');
  if (raw in LEGACY_TO_CURRENT_ACTION) return LEGACY_TO_CURRENT_ACTION[raw];
  if (ACTION_TYPES.includes(raw)) return raw;
  return 'CLICK';
};

const isPressKeyAction = (actionType?: string): boolean => normalizeActionType(actionType) === 'PRESS_KEY';
const isAssertionAction = (actionType?: string): boolean => normalizeActionType(actionType) === 'ASSERTION';
const isHandleAction = (actionType?: string): boolean => normalizeActionType(actionType) === 'HANDLE';
const isAutoGenTypingAction = (actionType?: string): boolean => ['CLICK_AND_TYPE', 'TYPE_AND_SELECT', 'CLEAR_AND_TYPE', 'TYPE'].includes(normalizeActionType(actionType));
const AUTO_GEN_VALUE_OPTIONS = ['Auto-GenValue'];
const DATE_TIME_FORMAT_OPTIONS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD HH:mm:ss',
  'DD/MM/YYYY HH:mm:ss',
  'HH:mm:ss',
  'hh:mm A',
];
const getAssertionLabel = (assertionType?: string): string => assertionType || 'ELEMENT_VISIBLE';
const getHandleLabel = (actionType?: string, handleType?: string): string => {
  const rawAction = (actionType || '').toUpperCase().trim().replace(/[\s\-/]+/g, '_');
  if (HANDLE_OPTIONS.includes(rawAction)) return rawAction;
  const normalizedHandle = (handleType || '').toUpperCase().trim().replace(/[\s\-/]+/g, '_');
  return HANDLE_OPTIONS.includes(normalizedHandle) ? normalizedHandle : 'HANDLE_ALERT_DIALOG';
};

const getHandleDisplayLabel = (handleType?: string): string => {
  switch (getHandleLabel(undefined, handleType)) {
    case 'HANDLE_ALERT_DIALOG':
      return 'Handle Alerts / Pop-ups / Dialogs';
    case 'HANDLE_CONFIRMATION':
      return 'Handle Confirmation Boxes';
    case 'HANDLE_NOTIFICATION':
      return 'Handle Notifications / Toasts';
    case 'HANDLE_OS_DIALOG':
      return 'Interact with OS-level dialogs';
    default:
      return getHandleLabel(undefined, handleType);
  }
};

const getSecondaryActionDisplayLabel = (secondaryAction?: string): string => {
  switch ((secondaryAction || '').toUpperCase().trim()) {
    case 'LOG_STEP':
      return 'Log Step';
    case 'AUTO_GENERATE_VALUE':
      return 'Auto-Generate Value';
    case 'TAKE_SCREENSHOT':
      return 'Take Screenshot';
    default:
      return 'None';
  }
};

const inferAutoGenTemporalKind = (elementName?: string): 'datetime' | 'date' | 'time' | null => {
  const normalized = String(elementName || '').toLowerCase();
  if (!normalized.trim()) return null;
  if (['timestamp', 'date time', 'datetime', 'time stamp', 'created at', 'updated at', 'created on', 'updated on'].some((keyword) => normalized.includes(keyword))) {
    return 'datetime';
  }
  if (['start time', 'end time', 'login time', 'time'].some((keyword) => normalized.includes(keyword))) {
    return 'time';
  }
  if (['date', 'booking date', 'start date', 'end date', 'created date', 'updated date'].some((keyword) => normalized.includes(keyword))) {
    return 'date';
  }
  return null;
};

const formatDateToken = (date: Date, format: string): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const replacements: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(hours24),
    hh: pad(hours12),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    A: hours24 >= 12 ? 'PM' : 'AM',
  };
  return format.replace(/YYYY|MM|DD|HH|hh|mm|ss|A/g, (token) => replacements[token] || token);
};

const generateTemporalValue = (format: string): string => {
  const now = new Date();
  const randomFutureOffsetDays = Math.floor(Math.random() * 365);
  const randomSeconds = Math.floor(Math.random() * 24 * 60 * 60);
  const generated = new Date(now.getTime() + (randomFutureOffsetDays * 24 * 60 * 60 * 1000) + (randomSeconds * 1000));
  return formatDateToken(generated, format);
};

const getTemporalFormatOptions = (elementName?: string): string[] => {
  const kind = inferAutoGenTemporalKind(elementName);
  if (kind === 'time') return ['HH:mm:ss', 'hh:mm A'];
  if (kind === 'date') return ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];
  if (kind === 'datetime') return ['YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD', 'HH:mm:ss'];
  return DATE_TIME_FORMAT_OPTIONS;
};

const generateSmartAutoValue = (elementName?: string): string => {
  const normalized = String(elementName || '').toLowerCase().trim();
  const now = new Date();
  const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const token = Math.random().toString(36).slice(2, 6);

  if (inferAutoGenTemporalKind(elementName)) {
    const format = getTemporalFormatOptions(elementName)[0];
    return generateTemporalValue(format);
  }
  if (['email', 'e mail', 'mail id', 'email id'].some((keyword) => normalized.includes(keyword))) {
    return `autouser_${stamp}${token}@example.com`;
  }
  if (['username', 'user name', 'userid', 'user id', 'login id', 'login'].some((keyword) => normalized.includes(keyword))) {
    return `autouser_${stamp}${token}`;
  }
  if (['phone', 'mobile', 'contact number', 'phone number', 'mobile number'].some((keyword) => normalized.includes(keyword))) {
    return `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  }
  if (['first name', 'firstname', 'given name'].some((keyword) => normalized.includes(keyword))) {
    return `Auto${stamp.slice(-6)}`;
  }
  if (['last name', 'lastname', 'surname', 'family name'].some((keyword) => normalized.includes(keyword))) {
    return `User${stamp.slice(-6)}`;
  }
  if (['full name', 'customer name', 'display name', 'name'].some((keyword) => normalized.includes(keyword))) {
    return `Auto User ${stamp.slice(-4)}`;
  }
  if (['password', 'passcode', 'passwd', 'pin'].some((keyword) => normalized.includes(keyword))) {
    return `Qa@${stamp}${token}!`;
  }
  return `Auto${stamp}${token}`;
};

const requestAiGeneratedValue = async (payload: {
  element_name?: string;
  test_step_description?: string;
  action_type?: string;
  page?: string;
}): Promise<string | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/ai/generate-test-value'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': localStorage.getItem('userEmail') || 'anonymous'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to generate AI value');
    }

    return String(data?.value || '').trim() || null;
  } catch (error) {
    console.warn('[AUTO_GENERATE_VALUE] AI generation failed, using fallback:', error);
    return null;
  }
};

const TestStepsGrid = forwardRef<TestStepsGridRef, TestStepsGridProps>(({
  selectedProject,
  selectedModule,
  testSteps,
  onTestStepsChange,
  readOnlyMode = false,
  onAutoXPathRefresh,
  testCaseName
}, ref) => {
  const [isAddingNewStep, setIsAddingNewStep] = useState(false);
  const [newStepData, setNewStepData] = useState({
    test_step_description: '',
    page: '',
    element_name: '',
    action_type: 'CLICK',
    assertion_type: '',
    secondary_action: '',
    secondary_value: '',
    xpath: '',
    values: ''
  });
  const [openPressKeyPicker, setOpenPressKeyPicker] = useState<string | number | null>(null);
  const [openAutoGenFormatPicker, setOpenAutoGenFormatPicker] = useState<string | number | null>(null);
  const [openSecondaryLogEditor, setOpenSecondaryLogEditor] = useState<string | number | null>(null);
  const [secondaryLogDraft, setSecondaryLogDraft] = useState('');
  const [isExcelSidebarOpen, setIsExcelSidebarOpen] = useState(false);
  const [mappedExcelSheet, setMappedExcelSheet] = useState<string>('');
  const [mappedExcelFileId, setMappedExcelFileId] = useState<number | null>(null);
  const [availableMappedSheets, setAvailableMappedSheets] = useState<string[]>([]);
  const [isUpdatingMappedSheet, setIsUpdatingMappedSheet] = useState(false);
  const [isReusableSidebarOpen, setIsReusableSidebarOpen] = useState(false);
  const [reusableTestCases, setReusableTestCases] = useState<ReusableTestCase[]>([]);
  const [selectedReusableTestCase, setSelectedReusableTestCase] = useState<ReusableTestCase | null>(null);
  const [reusableSearchTerm, setReusableSearchTerm] = useState('');
  const [reusableProjectFilter, setReusableProjectFilter] = useState('all');
  const [reusableModuleFilter, setReusableModuleFilter] = useState('all');
  const [isLoadingReusableTestCases, setIsLoadingReusableTestCases] = useState(false);
  const [isReusingTestSteps, setIsReusingTestSteps] = useState(false);
  const { toast } = useToast();

  // COMPREHENSIVE DEBUGGING SOLUTION - Step 2: Track Dummy XPath Source
  useEffect(() => {
    console.log('🔍 TESTSTEPS DEBUG: Component mounted');
    console.log('🔍 TESTSTEPS DEBUG: Initial testSteps:', testSteps);
    console.log('🔍 TESTSTEPS DEBUG: onTestStepsChange function available:', typeof onTestStepsChange);
    
    // Override onTestStepsChange to track all changes
    const originalOnTestStepsChange = onTestStepsChange;
    window.debugTestSteps = (steps: TestStep[], source: string = 'unknown') => {
      console.log('🔍 TESTSTEPS DEBUG: New steps from:', source, steps);
      originalOnTestStepsChange(steps);
    };
    
  }, []);

  const currentProjectName = selectedProject?.project_name || selectedProject?.name || selectedModule?.project_name || '';
  const currentModuleName = selectedModule?.module_name || selectedModule?.name || '';

  const buildTestStepQuery = (testCase: ReusableTestCase) => {
    const params = new URLSearchParams();
    if (testCase.project_name) params.set('project_name', testCase.project_name);
    if (testCase.module_name) params.set('module_name', testCase.module_name);
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const isCurrentReusableTestCase = (testCase: ReusableTestCase) => (
    testCase.name === testCaseName &&
    (!currentProjectName || testCase.project_name === currentProjectName) &&
    (!currentModuleName || testCase.module_name === currentModuleName)
  );

  const loadReusableTestCases = async () => {
    try {
      setIsLoadingReusableTestCases(true);
      const response = await fetch(buildApiUrl('/api/testcases/reusable'));
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load reusable test cases');
      }

      setReusableTestCases(data.test_cases || []);
    } catch (error) {
      console.error('Error loading reusable test cases:', error);
      toast({
        title: "Unable to load reusable test cases",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoadingReusableTestCases(false);
    }
  };

  const openReusableSidebar = () => {
    setIsReusableSidebarOpen(true);
    if (reusableTestCases.length === 0) {
      loadReusableTestCases();
    }
  };

  const normalizeStepForSave = (step: TestStep, index: number) => ({
    tc_id: testCaseName || '',
    step_no: index + 1,
    test_step_description: step.test_step_description || '',
    page: step.page || '',
    element_name: step.element_name || '',
    action_type: step.action_type || 'CLICK',
    assertion_type: step.assertion_type || '',
    secondary_action: step.secondary_action || '',
    secondary_value: step.secondary_value || '',
    xpath: step.xpath || '',
    values: step.values || ''
  });

  const handleReuseTestSteps = async () => {
    if (!selectedReusableTestCase || !testCaseName) {
      toast({
        title: "Select a testcase",
        description: "Choose a testcase to reuse before proceeding",
        variant: "destructive",
      });
      return;
    }

    if (isCurrentReusableTestCase(selectedReusableTestCase)) {
      toast({
        title: "Choose another testcase",
        description: "The current testcase cannot be reused into itself",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsReusingTestSteps(true);
      const sourceResponse = await fetch(
        buildApiUrl(`/api/teststeps/${encodeURIComponent(selectedReusableTestCase.name)}${buildTestStepQuery(selectedReusableTestCase)}`)
      );
      const sourceData = await sourceResponse.json().catch(() => ({}));

      if (!sourceResponse.ok) {
        throw new Error(sourceData?.error || 'Failed to load source test steps');
      }

      const sourceSteps: TestStep[] = Array.isArray(sourceData) ? sourceData : [];
      if (sourceSteps.length === 0) {
        throw new Error('The selected testcase does not have any test steps to reuse');
      }

      const nextIdBase = Date.now();
      const clonedSteps: TestStep[] = sourceSteps.map((step, index) => ({
        ...step,
        id: nextIdBase + index,
        tc_id: testCaseName,
        step_no: testSteps.length + index + 1
      }));
      const combinedSteps = [...testSteps, ...clonedSteps].map((step, index) => ({
        ...step,
        step_no: index + 1
      }));

      const saveResponse = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(testCaseName)}/bulk`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clear_existing: true,
          project_name: currentProjectName,
          module_name: currentModuleName,
          steps: combinedSteps.map(normalizeStepForSave)
        })
      });
      const saveData = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        throw new Error(saveData?.error || 'Failed to save reused test steps');
      }

      onTestStepsChange(combinedSteps);
      setIsReusableSidebarOpen(false);
      setSelectedReusableTestCase(null);
      toast({
        title: "Reusable testcase applied",
        description: `Copied ${sourceSteps.length} step${sourceSteps.length !== 1 ? 's' : ''} into ${testCaseName}`,
      });
    } catch (error) {
      console.error('Error reusing test steps:', error);
      toast({
        title: "Unable to reuse testcase",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsReusingTestSteps(false);
    }
  };

  const reusableProjectOptions = Array.from(
    new Set(reusableTestCases.map((testCase) => testCase.project_name).filter(Boolean))
  ).sort();

  const reusableModuleOptions = Array.from(
    new Set(
      reusableTestCases
        .filter((testCase) => reusableProjectFilter === 'all' || testCase.project_name === reusableProjectFilter)
        .map((testCase) => testCase.module_name)
        .filter(Boolean)
    )
  ).sort();

  const filteredReusableTestCases = reusableTestCases.filter((testCase) => {
    const matchesProject = reusableProjectFilter === 'all' || testCase.project_name === reusableProjectFilter;
    const matchesModule = reusableModuleFilter === 'all' || testCase.module_name === reusableModuleFilter;
    if (!matchesProject || !matchesModule) return false;

    const term = reusableSearchTerm.toLowerCase();
    if (!term) return true;
    return [
      testCase.name,
      testCase.testcase_id,
      testCase.description,
      testCase.project_name,
      testCase.module_name,
      testCase.suite_type
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  const applyObjectRenameAndXPathUpdate = (change?: {
    old_object_name?: string;
    object_name?: string;
    xpath?: string;
    page_name?: string;
  }) => {
    if (!change) return;

    const oldName = String(change.old_object_name || '').trim();
    const newName = String(change.object_name || '').trim();
    const newXPath = String(change.xpath || '').trim();
    const changedPage = String(change.page_name || '').trim();

    if (!newName && !newXPath) return;

    const updatedSteps = testSteps.map(step => {
      const stepPage = String(step.page || '').trim();
      const pageMatches = !changedPage || !stepPage || stepPage === changedPage;
      const nameMatches =
        (oldName && step.element_name === oldName) ||
        (!oldName && newName && step.element_name === newName);

      if (!pageMatches || !nameMatches) {
        return step;
      }

      const nextStep = { ...step };
      if (newName && nextStep.element_name !== newName) {
        nextStep.element_name = newName;
      }
      if (newXPath && nextStep.xpath !== newXPath) {
        nextStep.xpath = newXPath;
      }
      return nextStep;
    });

    const hasChanges = updatedSteps.some((step, idx) =>
      step.element_name !== testSteps[idx].element_name || step.xpath !== testSteps[idx].xpath
    );

    if (!hasChanges) return;

    onTestStepsChange(updatedSteps);

    if (onAutoXPathRefresh) {
      onAutoXPathRefresh(updatedSteps).catch(error => {
        console.error('❌ [Object Rename Sync] Failed to save updated steps:', error);
      });
    }
  };

  useImperativeHandle(ref, () => ({
    addNewStep: handleAddNewStep,
    editStep: () => {}, // Not needed anymore
    triggerXPathRefresh: (change) => {
      applyObjectRenameAndXPathUpdate(change);
      triggerRefresh();
    },
  }));

  const updateStep = (stepId: number, field: keyof TestStep, value: string | number) => {
    console.log('updateStep called:', { stepId, field, value });
    const updatedSteps = testSteps.map(step => {
      if (step.id === stepId) {
        const updatedValue = field === 'action_type' ? normalizeActionType(String(value)) : value;
        const updated = { ...step, [field]: updatedValue };
        if (field === 'action_type') {
          const normalizedAction = normalizeActionType(String(value));
          if (normalizedAction === 'PRESS_KEY' && !updated.values) {
            updated.values = 'ENTER';
          }
          if (normalizedAction === 'ASSERTION' && !updated.assertion_type) {
            updated.assertion_type = 'ELEMENT_VISIBLE';
          }
          if (normalizedAction === 'HANDLE') {
            updated.assertion_type = getHandleLabel(String(value), step.assertion_type);
          }
          setOpenPressKeyPicker((normalizedAction === 'PRESS_KEY' || normalizedAction === 'ASSERTION' || normalizedAction === 'HANDLE' || normalizedAction === 'CLICK_AND_TYPE' || normalizedAction === 'TYPE_AND_SELECT' || normalizedAction === 'CLEAR_AND_TYPE' || normalizedAction === 'TYPE') ? stepId : null);
        }
        
        // If page is changed, clear element_name and xpath to avoid confusion
        if (field === 'page') {
          updated.element_name = '';
          updated.xpath = '';
        }
        
        console.log('updateStep - updated step:', updated);
        return updated;
      }
      return step;
    });
    console.log('updateStep - calling onTestStepsChange with:', updatedSteps);
    onTestStepsChange(updatedSteps);
  };

  const updateStepFields = (stepId: number, updates: Partial<TestStep>) => {
    const updatedSteps = testSteps.map(step => (
      step.id === stepId ? { ...step, ...updates } : step
    ));
    onTestStepsChange(updatedSteps);
  };

  const applyNewStepSecondaryAction = async (nextAction: string) => {
    if (nextAction === 'AUTO_GENERATE_VALUE') {
      if (inferAutoGenTemporalKind(newStepData.element_name)) {
        setNewStepData((prev) => ({
          ...prev,
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: '',
        }));
        setOpenAutoGenFormatPicker('new');
      } else {
        const aiValue = await requestAiGeneratedValue({
          element_name: newStepData.element_name,
          test_step_description: newStepData.test_step_description,
          action_type: newStepData.action_type,
          page: newStepData.page
        });
        setNewStepData((prev) => ({
          ...prev,
          values: aiValue || generateSmartAutoValue(prev.element_name),
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: '',
        }));
      }
      return;
    }

    setNewStepData((prev) => ({
      ...prev,
      secondary_action: nextAction,
      secondary_value: nextAction === 'TAKE_SCREENSHOT' ? '' : prev.secondary_value,
    }));

    if (nextAction === 'LOG_STEP') {
      setSecondaryLogDraft(newStepData.secondary_value || '');
      setOpenSecondaryLogEditor('new');
    }
  };

  const applyRowSecondaryAction = async (step: TestStep, nextAction: string) => {
    if (nextAction === 'AUTO_GENERATE_VALUE') {
      if (inferAutoGenTemporalKind(step.element_name)) {
        updateStepFields(step.id, {
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: '',
        });
        setOpenAutoGenFormatPicker(step.id);
      } else {
        const aiValue = await requestAiGeneratedValue({
          element_name: step.element_name,
          test_step_description: step.test_step_description,
          action_type: step.action_type,
          page: step.page
        });
        updateStepFields(step.id, {
          values: aiValue || generateSmartAutoValue(step.element_name),
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: '',
        });
      }
      return;
    }

    updateStepFields(step.id, {
      secondary_action: nextAction,
      secondary_value: nextAction === 'TAKE_SCREENSHOT' ? '' : (step.secondary_value || ''),
    });

    if (nextAction === 'LOG_STEP') {
      setSecondaryLogDraft(step.secondary_value || '');
      setOpenSecondaryLogEditor(step.id);
    }
  };

  // New function to update multiple fields at once
  const updateStepMultiple = (stepId: number, updates: Partial<TestStep>) => {
    console.log('updateStepMultiple called:', { stepId, updates });
    const updatedSteps = testSteps.map(step => {
      if (step.id === stepId) {
        const updated = { ...step, ...updates };
        console.log('updateStepMultiple - updated step:', updated);
        return updated;
      }
      return step;
    });
    console.log('updateStepMultiple - calling onTestStepsChange with:', updatedSteps);
    onTestStepsChange(updatedSteps);
  };

  const deleteStep = (stepId: number) => {
    const updatedSteps = testSteps.filter(step => step.id !== stepId);
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));
    onTestStepsChange(reorderedSteps);
    toast({
      title: "Step Deleted",
      description: "Test step has been removed successfully",
    });
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    
    const updatedSteps = [...testSteps];
    [updatedSteps[index - 1], updatedSteps[index]] = [updatedSteps[index], updatedSteps[index - 1]];
    
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, idx) => ({
      ...step,
      step_no: idx + 1
    }));
    
    onTestStepsChange(reorderedSteps);
  };

  const moveStepDown = (index: number) => {
    if (index === testSteps.length - 1) return;
    
    const updatedSteps = [...testSteps];
    [updatedSteps[index], updatedSteps[index + 1]] = [updatedSteps[index + 1], updatedSteps[index]];
    
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, idx) => ({
      ...step,
      step_no: idx + 1
    }));
    
    onTestStepsChange(reorderedSteps);
  };

  const insertStepAfter = (afterIndex: number) => {
    const newStep: TestStep = {
      id: Date.now() + Math.random(),
      tc_id: 'TC001',
      step_no: afterIndex + 2,
      test_step_description: '',
      page: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    };
    
    const updatedSteps = [...testSteps];
    updatedSteps.splice(afterIndex + 1, 0, newStep);
    
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));
    
    onTestStepsChange(reorderedSteps);
  };



  const handleAddNewStep = () => {
    if (readOnlyMode) {
      toast({
        title: "Read-Only Mode",
        description: "Cannot add steps in read-only mode",
        variant: "destructive"
      });
      return;
    }
    
    if (isAddingNewStep) {
      toast({
        title: "Info",
        description: "Please complete the current step before adding a new one",
        variant: "default"
      });
      return;
    }
    
    setIsAddingNewStep(true);
    setNewStepData({
      test_step_description: '',
      page: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    });
    setOpenPressKeyPicker(null);
  };

  const handleSaveNewStep = () => {
    if (!newStepData.test_step_description.trim()) {
      toast({
        title: "Error",
        description: "Test step description is required",
        variant: "destructive"
      });
      return;
    }

    const newStep: TestStep = {
      id: Date.now() + Math.random(),
      tc_id: 'TC001',
      step_no: testSteps.length + 1,
      ...newStepData
    };

    const updatedSteps = [...testSteps, newStep];
    onTestStepsChange(updatedSteps);
    setIsAddingNewStep(false);
    setNewStepData({
      test_step_description: '',
      page: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    });
    setOpenPressKeyPicker(null);
    
    toast({
      title: "Step Added",
      description: "New test step has been added successfully",
    });
  };

  const handleCancelNewStep = () => {
    setIsAddingNewStep(false);
    setNewStepData({
      test_step_description: '',
      page: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    });
  };

  const updateNewStepData = (field: string, value: string) => {
    console.log('updateNewStepData called:', { field, value });
    setNewStepData(prev => {
      const normalizedValue = field === 'action_type' ? normalizeActionType(value) : value;
      const updated = { ...prev, [field]: normalizedValue };
      if (field === 'action_type') {
        const normalizedAction = normalizeActionType(value);
        if (normalizedAction === 'PRESS_KEY' && !updated.values) {
          updated.values = 'ENTER';
        }
        if (normalizedAction === 'ASSERTION' && !updated.assertion_type) {
          updated.assertion_type = 'ELEMENT_VISIBLE';
        }
        if (normalizedAction === 'HANDLE') {
          updated.assertion_type = getHandleLabel(value, prev.assertion_type);
        }
        setOpenPressKeyPicker((normalizedAction === 'PRESS_KEY' || normalizedAction === 'ASSERTION' || normalizedAction === 'HANDLE' || normalizedAction === 'CLICK_AND_TYPE' || normalizedAction === 'TYPE_AND_SELECT' || normalizedAction === 'CLEAR_AND_TYPE' || normalizedAction === 'TYPE') ? 'new' : null);
      }
      
      // If page is changed, clear element_name and xpath to avoid confusion
      if (field === 'page') {
        updated.element_name = '';
        updated.xpath = '';
      }
      
      console.log('updateNewStepData result:', updated);
      return updated;
    });
  };

  // Page dropdown data
  const [pages, setPages] = useState<{ id: number; page_name: string }[]>([]);
  const [loadingPages, setLoadingPages] = useState<boolean>(false);
  
  // Page objects data for dropdowns
  const [pageObjects, setPageObjects] = useState<{
    all_objects: Array<{
      page_name: string;
      object_name: string;
      xpath: string;
      browser_url?: string;
      is_browser?: boolean;
      display_name: string;
    }>;
    pages_data: Record<string, Array<{
      object_name: string;
      xpath: string;
      browser_url?: string;
      is_browser?: boolean;
    }>>;
  }>({ all_objects: [], pages_data: {} });
  const [loadingPageObjects, setLoadingPageObjects] = useState<boolean>(false);

  useEffect(() => {
    const loadPages = async () => {
      try {
        setLoadingPages(true);
        const res = await fetch(buildApiUrl('/api/page-names'));
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load pages');
        setPages(data || []);
      } catch (e) {
        console.error('Load pages error:', e);
      } finally {
        setLoadingPages(false);
      }
    };
    
    const loadPageObjects = async () => {
      try {
        setLoadingPageObjects(true);
        const res = await fetch(buildApiUrl('/api/page-objects/dropdown'));
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load page objects');
        
        console.log('Loaded page objects data:', data);
        setPageObjects(data || { all_objects: [], pages_data: {} });
      } catch (e) {
        console.error('Load page objects error:', e);
      } finally {
        setLoadingPageObjects(false);
      }
    };
    
    loadPages();
    loadPageObjects();
  }, []);

  const refetchMappedExcelSheet = async () => {
    const caseNameToUse = testCaseName || 'Unknown Test Case';

    try {
      console.log('[FETCH_EXCEL] Fetching mapped Excel for test case:', caseNameToUse);
      const res = await fetch(buildApiUrl(`/api/testcases/${encodeURIComponent(caseNameToUse)}/mapped-excel`));
      if (res.ok) {
        const data = await res.json();
        console.log('[FETCH_EXCEL] Response:', data);
        const mappedSheet = data.excelSheetName || '';
        const sheetsFromApi = Array.isArray(data.availableSheets) ? data.availableSheets : [];
        const mergedSheets = mappedSheet && !sheetsFromApi.includes(mappedSheet)
          ? [mappedSheet, ...sheetsFromApi]
          : sheetsFromApi;

        setMappedExcelSheet(mappedSheet);
        setMappedExcelFileId(
          typeof data.excelFileId === 'number' ? data.excelFileId : Number(data.excelFileId) || null
        );
        setAvailableMappedSheets(mergedSheets);
      } else {
        console.warn('[FETCH_EXCEL] API returned non-ok status:', res.status);
        setMappedExcelSheet('');
        setMappedExcelFileId(null);
        setAvailableMappedSheets([]);
      }
    } catch (error) {
      console.error('[FETCH_EXCEL] Error fetching mapped Excel sheet:', error);
      setMappedExcelSheet('');
      setMappedExcelFileId(null);
      setAvailableMappedSheets([]);
    }
  };

  const handleMappedSheetChange = async (sheetName: string) => {
    if (!sheetName || !mappedExcelFileId) {
      return;
    }

    const caseNameToUse = testCaseName || 'Unknown Test Case';
    const userEmail = localStorage.getItem('userEmail') || 'anonymous';
    setMappedExcelSheet(sheetName);
    setIsUpdatingMappedSheet(true);

    try {
      const parseResponse = await fetch(
        buildApiUrl(`/api/excel-files/${mappedExcelFileId}/parse?sheet_name=${encodeURIComponent(sheetName)}`),
        {
          headers: {
            'X-User-Email': userEmail
          }
        }
      );

      if (!parseResponse.ok) {
        const parseError = await parseResponse.json().catch(() => ({}));
        throw new Error(parseError.error || 'Failed to parse selected sheet');
      }

      const parseData = await parseResponse.json();
      const dataSets = parseData.data_sets ?? 0;

      const updateResponse = await fetch(buildApiUrl(`/api/testcases/${encodeURIComponent(caseNameToUse)}/mapped-excel`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        body: JSON.stringify({
          excelFileId: mappedExcelFileId,
          sheetName,
          dataSets
        })
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update sheet mapping');
      }

      toast({
        title: "Sheet Updated",
        description: `Mapped to "${sheetName}" successfully`,
      });

      await refetchMappedExcelSheet();
    } catch (error) {
      console.error('[UPDATE_SHEET] Failed to update mapped sheet:', error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Could not update mapped sheet",
        variant: "destructive"
      });
      await refetchMappedExcelSheet();
    } finally {
      setIsUpdatingMappedSheet(false);
    }
  };

  const handleDeleteMappedExcel = async () => {
    if (!mappedExcelSheet) {
      toast({
        title: "No Mapping",
        description: "No Excel sheet is currently mapped to this test case",
        variant: "destructive"
      });
      return;
    }

    if (!confirm('Are you sure you want to delete this Excel mapping? This action cannot be undone.')) {
      return;
    }

    const caseNameToUse = testCaseName || 'Unknown Test Case';

    try {
      console.log('[DELETE_EXCEL] Deleting mapped Excel for test case:', caseNameToUse);
      const res = await fetch(buildApiUrl(`/api/testcases/${encodeURIComponent(caseNameToUse)}/mapped-excel`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': localStorage.getItem('userEmail') || 'anonymous'
        }
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[DELETE_EXCEL] Success:', data);
        setMappedExcelSheet('');
        toast({
          title: "Mapping Deleted",
          description: "Excel mapping has been successfully removed from this test case",
        });
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete mapping (Status: ${res.status})`);
      }
    } catch (error) {
      console.error('[DELETE_EXCEL] Error:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete Excel mapping",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    refetchMappedExcelSheet();
  }, [testCaseName]);

  // AUTO-REFRESH XPATH HOOK
  const { triggerRefresh } = useAutoXPathRefresh(
    testSteps,
    pageObjects.all_objects,
    onTestStepsChange,
    (notification) => {
      // Show toast notification to user
      toast({
        title: "✅ XPath Auto-Updated",
        description: `${notification.object_name} on ${notification.page_name} was updated. Step(s) ${notification.affected_steps.join(', ')} refreshed automatically.`,
        duration: 5000,
      });

      console.log('📢 [XPath Refresh Notification]:', notification);
    },
    onAutoXPathRefresh
  );

  // Helper function to get objects for selected page
  const getObjectsForPage = (pageName: string) => {
    return pageObjects.pages_data[pageName] || [];
  };

  // Helper function to check if an element name exists in available options
  const isElementNameValid = (elementName: string, pageName?: string) => {
    if (!elementName) return false;
    
    if (pageName) {
      // Check if element exists in the specific page
      const pageObjectsForPage = getObjectsForPage(pageName);
      return pageObjectsForPage.some(obj => obj.object_name === elementName);
    }

    return false;
  };

  // Helper function to handle element selection and auto-populate xpath
  const handleElementSelection = (elementName: string, isNewStep: boolean = false, stepId?: number, currentPage?: string) => {
    console.log('handleElementSelection called:', { elementName, isNewStep, stepId, currentPage });
    
    // Find the selected object to get its xpath
    // If we have a current page, prioritize objects from that page
    let selectedObject;
    
    if (currentPage) {
      selectedObject = pageObjects.all_objects.find(obj => 
        obj.object_name === elementName && obj.page_name === currentPage
      );
    } else {
      selectedObject = pageObjects.all_objects.find(obj => obj.object_name === elementName);
    }
    
    console.log('selectedObject found:', selectedObject);
    
    if (selectedObject) {
      const isBrowserObject = !!selectedObject.is_browser || /^BROWSER(?:\s+\d+)?$/i.test(selectedObject.object_name || '');
      if (isNewStep) {
        // Update new step data
        setNewStepData(prev => ({
          ...prev,
          element_name: elementName,
          xpath: isBrowserObject ? '' : selectedObject.xpath,
          values: isBrowserObject ? (selectedObject.browser_url || '') : prev.values,
          action_type: isBrowserObject ? 'OPEN_BROWSER' : prev.action_type,
          page: selectedObject.page_name
        }));
      } else if (stepId) {
        // Update existing step - use single update to avoid race conditions
        const currentStep = testSteps.find(s => s.id === stepId);
        const updates: Partial<TestStep> = {
          element_name: elementName,
          xpath: isBrowserObject ? '' : selectedObject.xpath,
          values: isBrowserObject ? (selectedObject.browser_url || '') : currentStep?.values || '',
          action_type: isBrowserObject ? 'OPEN_BROWSER' : currentStep?.action_type || 'CLICK'
        };
        
        // Only update page if it's not already set
        if (!currentStep?.page) {
          updates.page = selectedObject.page_name;
        }
        
        updateStepMultiple(stepId, updates);
      }
    } else {
      // Manual entry - just update element name
      if (isNewStep) {
        setNewStepData(prev => ({
          ...prev,
          element_name: elementName
        }));
      } else if (stepId) {
        updateStep(stepId, 'element_name', elementName);
      }
    }
  };

  return (
    <Card className="test-steps-theme bg-white backdrop-blur-sm border-gray-200 dark:bg-card dark:border-border">
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 flex items-center justify-between">
          <span>Test Steps Grid ({testSteps.length} steps)</span>
          <div className="flex items-center space-x-2">
            {!readOnlyMode && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openReusableSidebar}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Reusable Testcase
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsExcelSidebarOpen(true)}
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  <Database className="w-4 h-4 mr-2" />
                  Select Value
                </Button>
                <select
                  value={mappedExcelSheet || ''}
                  onChange={(e) => handleMappedSheetChange(e.target.value)}
                  disabled={!mappedExcelFileId || isUpdatingMappedSheet || availableMappedSheets.length === 0}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-700 w-48 disabled:text-gray-400 disabled:bg-gray-100"
                >
                  {!mappedExcelSheet && (
                    <option value="">No Excel sheet mapped</option>
                  )}
                  {availableMappedSheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
                {mappedExcelSheet && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDeleteMappedExcel}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Delete Excel mapping"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </>
            )}
            {readOnlyMode && (
              <Badge variant="outline" className="bg-orange-50 border-orange-200 text-orange-700">
                📖 Read-Only Mode
              </Badge>
            )}
          </div>
        </CardTitle>
        {readOnlyMode && (
          <p className="text-sm text-orange-600 mt-1">
            Test steps cannot be modified in read-only mode. Use the main development workflow to create and edit steps.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {testSteps.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <PlusCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Test Steps</h3>
            <p className="text-gray-500 mb-4">
              {readOnlyMode
                ? "No test steps are available for this test case. Test steps are read-only in this view."
                : "Start by adding your first test step using the Add Step button"
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-16">
                    Step #
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[200px]">
                    Description
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-40">
                    Page
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-32">
                    Element Name
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-40">
                    Action Type
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-32">
                    Values
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[200px]">
                    XPath
                  </th>
                  <th className="border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700 w-40">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* New Step Input Row */}
                {isAddingNewStep && !readOnlyMode && (
                  <tr className="bg-blue-50 border-2 border-blue-200">
                    {/* Step Number */}
                    <td className="border border-gray-200 px-4 py-3 text-center">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto">
                        {testSteps.length + 1}
                      </div>
                    </td>

                    {/* Description */}
                    <td className="border border-gray-200 px-4 py-3">
                      <Textarea
                        value={newStepData.test_step_description}
                        onChange={(e) => updateNewStepData('test_step_description', e.target.value)}
                        placeholder="Describe what this step does... *"
                        className="w-full min-h-[60px] border-blue-300 focus:border-blue-500"
                        rows={2}
                        autoFocus
                      />
                    </td>

                    {/* Page */}
                    <td className="border border-gray-200 px-4 py-3">
                      <select
                        value={newStepData.page}
                        onChange={(e) => updateNewStepData('page', e.target.value)}
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">Select Page</option>
                        {pages.map(p => (
                          <option key={p.id} value={p.page_name}>{p.page_name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Element Name */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="space-y-2">
                        <select
                          value={newStepData.element_name && isElementNameValid(newStepData.element_name, newStepData.page) ? newStepData.element_name : ''}
                          onChange={(e) => {
                            const selectedValue = e.target.value;
                            if (selectedValue === '__manual__') {
                              // Switch to manual entry mode
                              updateNewStepData('element_name', '');
                            } else {
                              handleElementSelection(selectedValue, true, undefined, newStepData.page);
                            }
                          }}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          disabled={loadingPageObjects || !newStepData.page}
                        >
                          <option value="">
                            {loadingPageObjects ? 'Loading elements...' : newStepData.page ? 'Select Element' : 'Select Page first'}
                          </option>
                          {!loadingPageObjects && newStepData.page && getObjectsForPage(newStepData.page).map((obj, index) => (
                            <option key={`${newStepData.page}-${obj.object_name}-${index}`} value={obj.object_name}>
                              {obj.object_name}
                            </option>
                          ))}
                          
                        </select>
                        
                        {/* Always show manual input field for full freedom */}
                        <div className="relative">
                          <Input
                            value={newStepData.element_name}
                            onChange={(e) => updateNewStepData('element_name', e.target.value)}
                            placeholder="Type any element name (full freedom to write custom names)"
                            className="w-full text-sm border-blue-300 focus:border-blue-500"
                            autoFocus={!newStepData.element_name}
                          />
                          
                        </div>
                      </div>
                    </td>

                    {/* Action Type */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="relative">
                        <select
                          value={normalizeActionType(newStepData.action_type)}
                          onChange={(e) => updateNewStepData('action_type', e.target.value)}
                          onClick={() => (isPressKeyAction(newStepData.action_type) || isAssertionAction(newStepData.action_type) || isHandleAction(newStepData.action_type)) && setOpenPressKeyPicker('new')}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          {ACTION_TYPES.map(action => (
                            <option key={action} value={action}>{action}</option>
                          ))}
                        </select>
                        {isPressKeyAction(newStepData.action_type) && (
                          <div className="mt-1 text-xs font-medium text-blue-700">
                            Key: {newStepData.values || 'ENTER'}
                          </div>
                        )}
                        {isAssertionAction(newStepData.action_type) && (
                          <div className="mt-1 text-xs font-medium text-amber-700">
                            Assertion: {getAssertionLabel(newStepData.assertion_type)}
                          </div>
                        )}
                        {isHandleAction(newStepData.action_type) && (
                          <div className="mt-1 text-xs font-medium text-emerald-700">
                            Handle: {getHandleDisplayLabel(newStepData.assertion_type)}
                          </div>
                        )}
                        {(isPressKeyAction(newStepData.action_type) || isAssertionAction(newStepData.action_type) || isHandleAction(newStepData.action_type)) && openPressKeyPicker === 'new' && (
                          <div className="absolute bottom-0 left-full z-20 ml-2 w-48 rounded-md border border-blue-300 bg-white p-1 shadow-lg">
                            {(isPressKeyAction(newStepData.action_type) ? PRESS_KEY_OPTIONS : isAssertionAction(newStepData.action_type) ? ASSERTION_OPTIONS : HANDLE_OPTIONS).map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  if (isPressKeyAction(newStepData.action_type)) {
                                    updateNewStepData('values', option);
                                  } else {
                                    updateNewStepData('assertion_type', option);
                                  }
                                  setOpenPressKeyPicker(null);
                                }}
                                className={`block w-full rounded px-3 py-2 text-left text-sm ${
                                  (isPressKeyAction(newStepData.action_type)
                                    ? (newStepData.values || 'ENTER')
                                    : isAssertionAction(newStepData.action_type)
                                      ? getAssertionLabel(newStepData.assertion_type)
                                      : getHandleLabel(newStepData.action_type, newStepData.assertion_type)) === option
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'text-gray-700 hover:bg-blue-50'
                                }`}
                              >
                                {isHandleAction(newStepData.action_type) ? getHandleDisplayLabel(option) : option}
                              </button>
                            ))}
                          </div>
                        )}
                        {openAutoGenFormatPicker === 'new' && (
                          <div className="absolute bottom-0 left-full z-20 ml-52 w-56 rounded-md border border-sky-200 bg-white p-1 shadow-lg">
                            {getTemporalFormatOptions(newStepData.element_name).map((format) => (
                              <button
                                key={format}
                                type="button"
                                onClick={() => {
                                  setNewStepData((prev) => ({
                                    ...prev,
                                    values: generateTemporalValue(format),
                                    secondary_action: 'AUTO_GENERATE_VALUE',
                                    secondary_value: '',
                                  }));
                                  setOpenAutoGenFormatPicker(null);
                                }}
                                className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-sky-50"
                              >
                                {format}
                              </button>
                            ))}
                          </div>
                        )}
                        <select
                          value={newStepData.secondary_action || ''}
                          onChange={(e) => applyNewStepSecondaryAction(e.target.value)}
                          className="mt-2 w-full px-3 py-2 border border-rose-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm"
                        >
                          {SECONDARY_ACTION_OPTIONS.map((action) => (
                            <option key={action || 'none'} value={action}>
                              {getSecondaryActionDisplayLabel(action)}
                            </option>
                          ))}
                        </select>
                        {newStepData.secondary_action === 'LOG_STEP' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                            onClick={() => {
                              setSecondaryLogDraft(newStepData.secondary_value || '');
                              setOpenSecondaryLogEditor('new');
                            }}
                          >
                            {newStepData.secondary_value ? 'Edit Log' : 'Add Log'}
                          </Button>
                        )}
                        {newStepData.secondary_action && (
                          <div className="mt-1 text-xs font-medium text-rose-700">
                            {newStepData.secondary_action === 'LOG_STEP'
                              ? (newStepData.secondary_value || 'No log message saved yet')
                              : newStepData.secondary_action === 'AUTO_GENERATE_VALUE'
                                ? 'Generates a matching value directly into the Values box'
                              : 'Screenshot will be captured after the main action'}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Values */}
                    <td className="border border-gray-200 px-4 py-3">
                      <Input
                        value={newStepData.values}
                        onChange={(e) => updateNewStepData('values', e.target.value)}
                        placeholder={isPressKeyAction(newStepData.action_type) ? "Selected from key dropdown" : isAssertionAction(newStepData.action_type) ? "Expected text / URL / title / attribute=value" : isHandleAction(newStepData.action_type) ? "accept; contains=... / file=... / print" : "Input values"}
                        className="w-full border-blue-300 focus:border-blue-500"
                        disabled={isPressKeyAction(newStepData.action_type)}
                      />
                    </td>

                    {/* XPath */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="relative">
                        <Input
                          value={newStepData.xpath}
                          onChange={(e) => updateNewStepData('xpath', e.target.value)}
                          placeholder="Element XPath (auto-populated when element selected)"
                          className="w-full font-mono text-xs border-blue-300 focus:border-blue-500"
                        />
                        {newStepData.xpath && pageObjects.all_objects.find(obj => 
                          obj.object_name === newStepData.element_name && obj.xpath === newStepData.xpath
                        ) && (
                          <div className="absolute right-2 top-2 text-green-500 text-xs">
                            ✓ Auto
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="flex items-center justify-center space-x-1">
                        <Button
                          size="sm"
                          onClick={handleSaveNewStep}
                          className="bg-green-500 hover:bg-green-600 h-8 w-8 p-0"
                        >
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelNewStep}
                          className="h-8 w-8 p-0 border-red-200 text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}

                {testSteps.map((step, index) => (
                  <tr key={step.id} className="hover:bg-gray-50">
                    {/* Step Number */}
                    <td className="border border-gray-200 px-4 py-3 text-center">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto">
                        {step.step_no}
                      </div>
                    </td>

                    {/* Description */}
                    <td className="border border-gray-200 px-4 py-3">
                      <Textarea
                        value={step.test_step_description || ''}
                        onChange={(e) => !readOnlyMode && updateStep(step.id, 'test_step_description', e.target.value)}
                        placeholder="Describe what this step does..."
                        className={`w-full min-h-[60px] ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        rows={2}
                        disabled={readOnlyMode}
                      />
                    </td>

                    {/* Page */}
                    <td className="border border-gray-200 px-4 py-3">
                      <select
                        value={step.page || ''}
                        onChange={(e) => !readOnlyMode && updateStep(step.id, 'page', e.target.value)}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={readOnlyMode}
                      >
                        <option value="">Select Page</option>
                        {pages.map(p => (
                          <option key={p.id} value={p.page_name}>{p.page_name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Element Name */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="space-y-2">
                        <select
                          value={step.element_name && isElementNameValid(step.element_name, step.page) ? step.element_name : ''}
                          onChange={(e) => {
                            if (!readOnlyMode) {
                              const selectedValue = e.target.value;
                              if (selectedValue === '__manual__') {
                                // Switch to manual entry mode
                                updateStep(step.id, 'element_name', '');
                              } else {
                                handleElementSelection(selectedValue, false, step.id, step.page);
                              }
                            }
                          }}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          disabled={readOnlyMode || loadingPageObjects || !step.page}
                        >
                          <option value="">
                            {loadingPageObjects ? 'Loading elements...' : step.page ? 'Select Element' : 'Select Page first'}
                          </option>
                          {!loadingPageObjects && step.page && getObjectsForPage(step.page).map((obj, index) => (
                            <option key={`${step.page}-${obj.object_name}-${index}`} value={obj.object_name}>
                              {obj.object_name}
                            </option>
                          ))}
                          {!loadingPageObjects && !readOnlyMode && <option value="__manual__">✏️ Type Custom Element Name</option>}
                        </select>
                        
                        {/* Always show manual input field for full freedom */}
                        {!readOnlyMode && (
                          <div className="relative">
                            <Input
                              value={step.element_name || ''}
                              onChange={(e) => updateStep(step.id, 'element_name', e.target.value)}
                              placeholder="Type any element name (full freedom to write custom names)"
                              className="w-full text-sm"
                              autoFocus={!step.element_name}
                            />
                            {!step.element_name && (
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
    
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Action Type */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="relative">
                        <select
                          value={normalizeActionType(step.action_type)}
                          onChange={(e) => !readOnlyMode && updateStep(step.id, 'action_type', e.target.value)}
                          onClick={() => !readOnlyMode && (isPressKeyAction(step.action_type) || isAssertionAction(step.action_type) || isHandleAction(step.action_type)) && setOpenPressKeyPicker(step.id)}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          disabled={readOnlyMode}
                        >
                          {ACTION_TYPES.map(action => (
                            <option key={action} value={action}>{action}</option>
                          ))}
                        </select>
                        {isPressKeyAction(step.action_type) && (
                          <div className="mt-1 text-xs font-medium text-purple-700">
                            Key: {step.values || 'ENTER'}
                          </div>
                        )}
                        {isAssertionAction(step.action_type) && (
                          <div className="mt-1 text-xs font-medium text-amber-700">
                            Assertion: {getAssertionLabel(step.assertion_type)}
                          </div>
                        )}
                        {isHandleAction(step.action_type) && (
                          <div className="mt-1 text-xs font-medium text-emerald-700">
                            Handle: {getHandleDisplayLabel(step.assertion_type)}
                          </div>
                        )}
                        {(isPressKeyAction(step.action_type) || isAssertionAction(step.action_type) || isHandleAction(step.action_type)) && openPressKeyPicker === step.id && (
                          <div className={`absolute bottom-0 left-full z-20 ml-2 w-48 rounded-md border border-gray-300 bg-white p-1 shadow-lg ${readOnlyMode ? 'pointer-events-none bg-gray-100' : ''}`}>
                            {(isPressKeyAction(step.action_type) ? PRESS_KEY_OPTIONS : isAssertionAction(step.action_type) ? ASSERTION_OPTIONS : HANDLE_OPTIONS).map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  if (!readOnlyMode) {
                                    if (isPressKeyAction(step.action_type)) {
                                      updateStep(step.id, 'values', option);
                                    } else {
                                      updateStep(step.id, 'assertion_type', option);
                                    }
                                    setOpenPressKeyPicker(null);
                                  }
                                }}
                                className={`block w-full rounded px-3 py-2 text-left text-sm ${
                                  (isPressKeyAction(step.action_type)
                                    ? (step.values || 'ENTER')
                                    : isAssertionAction(step.action_type)
                                      ? getAssertionLabel(step.assertion_type)
                                      : getHandleLabel(step.action_type, step.assertion_type)) === option
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'text-gray-700 hover:bg-purple-50'
                                }`}
                                disabled={readOnlyMode}
                              >
                                {isHandleAction(step.action_type) ? getHandleDisplayLabel(option) : option}
                              </button>
                            ))}
                          </div>
                        )}
                        {openAutoGenFormatPicker === step.id && (
                          <div className={`absolute bottom-0 left-full z-20 ml-52 w-56 rounded-md border border-sky-200 bg-white p-1 shadow-lg ${readOnlyMode ? 'pointer-events-none bg-gray-100' : ''}`}>
                            {getTemporalFormatOptions(step.element_name).map((format) => (
                              <button
                                key={format}
                                type="button"
                                onClick={() => {
                                  if (!readOnlyMode) {
                                    updateStep(step.id, 'values', generateTemporalValue(format));
                                    updateStep(step.id, 'secondary_action', 'AUTO_GENERATE_VALUE');
                                    updateStep(step.id, 'secondary_value', '');
                                    setOpenAutoGenFormatPicker(null);
                                  }
                                }}
                                className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-sky-50"
                                disabled={readOnlyMode}
                              >
                                {format}
                              </button>
                            ))}
                          </div>
                        )}
                        <select
                          value={step.secondary_action || ''}
                          onChange={(e) => {
                            if (!readOnlyMode) {
                              applyRowSecondaryAction(step, e.target.value);
                            }
                          }}
                          className={`mt-2 w-full px-3 py-2 border border-rose-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          disabled={readOnlyMode}
                        >
                          {SECONDARY_ACTION_OPTIONS.map((action) => (
                            <option key={action || 'none'} value={action}>
                              {getSecondaryActionDisplayLabel(action)}
                            </option>
                          ))}
                        </select>
                        {step.secondary_action === 'LOG_STEP' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                            onClick={() => {
                              setSecondaryLogDraft(step.secondary_value || '');
                              setOpenSecondaryLogEditor(step.id);
                            }}
                            disabled={readOnlyMode}
                          >
                            {step.secondary_value ? 'Edit Log' : 'Add Log'}
                          </Button>
                        )}
                        {step.secondary_action && (
                          <div className="mt-1 text-xs font-medium text-rose-700">
                            {step.secondary_action === 'LOG_STEP'
                              ? (step.secondary_value || 'No log message saved yet')
                              : step.secondary_action === 'AUTO_GENERATE_VALUE'
                                ? 'Generates a matching value directly into the Values box'
                              : 'Screenshot will be captured after the main action'}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Values */}
                    <td className="border border-gray-200 px-4 py-3">
                      <Input
                        value={step.values || ''}
                        onChange={(e) => !readOnlyMode && updateStep(step.id, 'values', e.target.value)}
                        placeholder={isPressKeyAction(step.action_type) ? "Selected from key dropdown" : isAssertionAction(step.action_type) ? "Expected text / URL / title / attribute=value" : isHandleAction(step.action_type) ? "accept; contains=... / file=... / print" : "Input values"}
                        className={`w-full ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={readOnlyMode || isPressKeyAction(step.action_type)}
                      />
                    </td>

                    {/* XPath */}
                    <td className="border border-gray-200 px-4 py-3">
                      <div className="relative">
                        <Input
                          value={step.xpath || ''}
                          onChange={(e) => !readOnlyMode && updateStep(step.id, 'xpath', e.target.value)}
                          placeholder="Element XPath (auto-populated when element selected)"
                          className={`w-full font-mono text-xs ${readOnlyMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          disabled={readOnlyMode}
                        />
                        {step.xpath && pageObjects.all_objects.find(obj => 
                          obj.object_name === step.element_name && obj.xpath === step.xpath
                        ) && (
                          <div className="absolute right-2 top-2 text-green-500 text-xs">
                            ✓ Auto
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="border border-gray-200 px-4 py-3">
                      {readOnlyMode ? (
                        <div className="flex items-center justify-center">
                          <Badge variant="secondary" className="text-xs">Read Only</Badge>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => moveStepUp(index)}
                            disabled={index === 0}
                            className="h-8 w-8 p-0"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => moveStepDown(index)}
                            disabled={index === testSteps.length - 1}
                            className="h-8 w-8 p-0"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => insertStepAfter(index)}
                            className="border-green-200 text-green-600 h-8 w-8 p-0"
                          >
                            <PlusCircle className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteStep(step.id)}
                            className="border-red-200 text-red-600 h-8 w-8 p-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Excel Upload Sidebar */}
      <ExcelUploadSidebar
        isOpen={isExcelSidebarOpen}
        onClose={() => setIsExcelSidebarOpen(false)}
        onMappingSuccess={() => {
          console.log('[MAPPING_SUCCESS] Excel sheet mapped successfully, refetching...');
          refetchMappedExcelSheet();
          setIsExcelSidebarOpen(false);
        }}
        testCaseName={testCaseName || 'Unknown Test Case'}
      />

      <Sheet open={isReusableSidebarOpen} onOpenChange={setIsReusableSidebarOpen}>
        <SheetContent className="w-[420px] sm:w-[560px] bg-white">
          <SheetHeader>
            <SheetTitle className="text-gray-900">Reusable Testcase</SheetTitle>
            <p className="text-sm text-gray-600">Choose a testcase and copy its steps into the current testcase.</p>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Select Project
                </label>
                <select
                  value={reusableProjectFilter}
                  onChange={(e) => {
                    setReusableProjectFilter(e.target.value);
                    setReusableModuleFilter('all');
                    setSelectedReusableTestCase(null);
                  }}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Projects</option>
                  {reusableProjectOptions.map((projectName) => (
                    <option key={projectName} value={projectName}>
                      {projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Select Module
                </label>
                <select
                  value={reusableModuleFilter}
                  onChange={(e) => {
                    setReusableModuleFilter(e.target.value);
                    setSelectedReusableTestCase(null);
                  }}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Modules</option>
                  {reusableModuleOptions.map((moduleName) => (
                    <option key={moduleName} value={moduleName}>
                      {moduleName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={reusableSearchTerm}
                onChange={(e) => setReusableSearchTerm(e.target.value)}
                placeholder="Search testcases..."
                className="pl-10 bg-gray-50 border-gray-200"
              />
            </div>

            <div className="max-h-[calc(100vh-230px)] space-y-3 overflow-y-auto pr-1">
              {isLoadingReusableTestCases ? (
                <div className="flex items-center justify-center py-10 text-gray-600">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading testcases...
                </div>
              ) : filteredReusableTestCases.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  No testcases found.
                </div>
              ) : (
                filteredReusableTestCases.map((testCase) => {
                  const isSelected = selectedReusableTestCase?.id === testCase.id;
                  const isCurrent = isCurrentReusableTestCase(testCase);

                  return (
                    <button
                      key={testCase.id}
                      type="button"
                      onClick={() => !isCurrent && setSelectedReusableTestCase(testCase)}
                      disabled={isCurrent}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50'
                          : isCurrent
                            ? 'cursor-not-allowed border-gray-200 bg-gray-100 opacity-70'
                            : 'border-gray-200 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{testCase.name}</p>
                          <p className="mt-1 truncate text-xs text-gray-600">
                            {[testCase.project_name, testCase.module_name, testCase.suite_type].filter(Boolean).join(' - ')}
                          </p>
                          {testCase.description && (
                            <p className="mt-2 line-clamp-2 text-sm text-gray-600">{testCase.description}</p>
                          )}
                        </div>
                        {testCase.testcase_id && (
                          <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 text-blue-700">
                            {testCase.testcase_id}
                          </Badge>
                        )}
                      </div>
                      {isCurrent && (
                        <p className="mt-2 text-xs font-medium text-gray-500">Current testcase</p>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <Button variant="outline" onClick={() => setIsReusableSidebarOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleReuseTestSteps}
                disabled={!selectedReusableTestCase || isReusingTestSteps}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isReusingTestSteps && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Proceed
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={openSecondaryLogEditor !== null} onOpenChange={(open) => {
        if (!open) {
          setOpenSecondaryLogEditor(null);
          setSecondaryLogDraft('');
        }
      }}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Log Step Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={secondaryLogDraft}
              onChange={(e) => setSecondaryLogDraft(e.target.value)}
              placeholder="Type the custom message to save after the main action completes"
              className="min-h-[140px] bg-gray-50 border-gray-200 text-gray-900"
            />
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (openSecondaryLogEditor === 'new') {
                    setNewStepData((prev) => ({
                      ...prev,
                      secondary_action: '',
                      secondary_value: '',
                    }));
                  } else if (typeof openSecondaryLogEditor === 'number') {
                    updateStep(openSecondaryLogEditor, 'secondary_action', '');
                    updateStep(openSecondaryLogEditor, 'secondary_value', '');
                  }
                  setOpenSecondaryLogEditor(null);
                  setSecondaryLogDraft('');
                }}
              >
                Delete
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenSecondaryLogEditor(null);
                  setSecondaryLogDraft('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-gradient-to-r from-rose-500 to-orange-500"
                onClick={() => {
                  if (openSecondaryLogEditor === 'new') {
                    setNewStepData((prev) => ({
                      ...prev,
                      secondary_action: 'LOG_STEP',
                      secondary_value: secondaryLogDraft,
                    }));
                  } else if (typeof openSecondaryLogEditor === 'number') {
                    updateStep(openSecondaryLogEditor, 'secondary_action', 'LOG_STEP');
                    updateStep(openSecondaryLogEditor, 'secondary_value', secondaryLogDraft);
                  }
                  setOpenSecondaryLogEditor(null);
                  setSecondaryLogDraft('');
                }}
              >
                Save Log
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
});

TestStepsGrid.displayName = 'TestStepsGrid';

export default TestStepsGrid;
