import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Settings, ArrowRight, ArrowLeft, Save, Play, ArrowUp, ArrowDown, PlusCircle } from 'lucide-react';
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
  assertion_type?: string;
  secondary_action?: string;
  secondary_value?: string;
  xpath: string;
  values: string;
}

interface TestConfigDashboardProps {
  selectedTestCase?: any;
  selectedProject?: any;
  selectedModule?: any;
  testSteps?: TestStep[];
  onTestStepsChange?: (steps: TestStep[]) => void;
  onNext?: () => void;
  onBack?: () => void;
  developmentMode?: boolean;
  onSave?: () => void;
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
const SECONDARY_ACTION_OPTIONS = ['', 'LOG_STEP', 'AUTO_GENERATE_VALUE', 'TAKE_SCREENSHOT'];
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

const getSecondaryActionDisplayLabel = (secondaryAction?: string): string => {
  switch ((secondaryAction || '').toUpperCase()) {
    case 'LOG_STEP':
      return 'Log Step';
    case 'TAKE_SCREENSHOT':
      return 'Take Screenshot';
    default:
      return 'None';
  }
};

const TestConfigDashboard: React.FC<TestConfigDashboardProps> = ({ 
  selectedTestCase, 
  selectedProject,
  selectedModule,
  testSteps = [],
  onTestStepsChange,
  onNext, 
  onBack,
  developmentMode = false,
  onSave
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingStep, setEditingStep] = useState<TestStep | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSteps, setGridSteps] = useState<TestStep[]>([]);
  const [openPressKeyPicker, setOpenPressKeyPicker] = useState<string | number | null>(null);
  const [openAutoGenFormatPicker, setOpenAutoGenFormatPicker] = useState<string | number | null>(null);
  const [openSecondaryLogEditor, setOpenSecondaryLogEditor] = useState<string | number | null>(null);
  const [secondaryLogDraft, setSecondaryLogDraft] = useState('');
  const [formData, setFormData] = useState({
    tc_id: '',
    step_no: 1,
    test_step_description: '',
    element_name: '',
    action_type: 'CLICK',
    assertion_type: '',
    secondary_action: '',
    secondary_value: '',
    xpath: '',
    values: ''
  });
  const { toast } = useToast();

  // Load existing test steps when test case is selected
  useEffect(() => {
    if (selectedTestCase && selectedTestCase.name) {
      loadExistingTestSteps();
      // Reset form with correct TC ID when test case changes
      resetForm();
    }
  }, [selectedTestCase]);

  const loadExistingTestSteps = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(selectedTestCase.name)}`));
      
      if (response.ok) {
        const existingSteps = await response.json();
        if (existingSteps.length > 0) {
          console.log(`✅ Loaded ${existingSteps.length} existing test steps for ${selectedTestCase.name}`);
          onTestStepsChange(existingSteps);
        }
      } else {
        console.log(`No existing test steps found for ${selectedTestCase.name}`);
      }
    } catch (error) {
      console.error('Error loading existing test steps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    // Extract TC ID from the selected test case's testcase_id
    const tcId = selectedTestCase?.testcase_id ? 
      selectedTestCase.testcase_id.split('_').pop() || 'TC001' : 'TC001';
    
    setFormData({
      tc_id: tcId,
      step_no: testSteps.length + 1,
      test_step_description: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    });
  };

  const addMoreSteps = () => {
    // Extract TC ID from the selected test case's testcase_id
    const tcId = selectedTestCase?.testcase_id ? 
      selectedTestCase.testcase_id.split('_').pop() || 'TC001' : 'TC001';
    
    const newStep: TestStep = {
      id: Date.now() + Math.random(),
      tc_id: tcId,
      step_no: gridSteps.length + 1,
      test_step_description: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    };
    setGridSteps([...gridSteps, newStep]);
  };

  const updateGridStep = (stepId: number, field: string, value: string | number) => {
    setGridSteps(gridSteps.map(step => 
      step.id === stepId
        ? {
            ...step,
            [field]: field === 'action_type' ? normalizeActionType(String(value)) : value,
            ...(field === 'action_type' && normalizeActionType(String(value)) === 'PRESS_KEY' && !step.values ? { values: 'ENTER' } : {}),
            ...(field === 'action_type' && normalizeActionType(String(value)) === 'ASSERTION' && !step.assertion_type ? { assertion_type: 'ELEMENT_VISIBLE' } : {}),
            ...(field === 'action_type' && normalizeActionType(String(value)) === 'HANDLE' ? { assertion_type: getHandleLabel(String(value), step.assertion_type) } : {})
          }
        : step
    ));
    if (field === 'action_type') {
      const normalizedAction = normalizeActionType(String(value));
      setOpenPressKeyPicker((normalizedAction === 'PRESS_KEY' || normalizedAction === 'ASSERTION' || normalizedAction === 'HANDLE') ? stepId : null);
    }
  };

  const updateGridStepFields = (stepId: number, updates: Partial<TestStep>) => {
    setGridSteps((prev) => prev.map((step) => (
      step.id === stepId ? { ...step, ...updates } : step
    )));
  };

  const applyFormSecondaryAction = (nextAction: string) => {
    if (nextAction === 'AUTO_GENERATE_VALUE') {
      if (inferAutoGenTemporalKind(formData.element_name)) {
        setFormData((prev) => ({
          ...prev,
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: ''
        }));
        setOpenAutoGenFormatPicker('form');
      } else {
        setFormData((prev) => ({
          ...prev,
          values: generateSmartAutoValue(prev.element_name),
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: ''
        }));
      }
      setOpenSecondaryLogEditor(null);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      secondary_action: nextAction,
      secondary_value: nextAction === 'TAKE_SCREENSHOT' ? '' : prev.secondary_value
    }));

    if (nextAction === 'LOG_STEP') {
      setSecondaryLogDraft(formData.secondary_value || '');
      setOpenSecondaryLogEditor('form');
    } else {
      setOpenSecondaryLogEditor(null);
    }
  };

  const applyGridSecondaryAction = (stepId: number, nextAction: string, elementName: string, currentSecondaryValue: string) => {
    if (nextAction === 'AUTO_GENERATE_VALUE') {
      if (inferAutoGenTemporalKind(elementName)) {
        updateGridStepFields(stepId, {
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: ''
        });
        setOpenAutoGenFormatPicker(stepId);
      } else {
        updateGridStepFields(stepId, {
          values: generateSmartAutoValue(elementName),
          secondary_action: 'AUTO_GENERATE_VALUE',
          secondary_value: ''
        });
      }
      return;
    }

    updateGridStepFields(stepId, {
      secondary_action: nextAction,
      secondary_value: nextAction === 'TAKE_SCREENSHOT' ? '' : currentSecondaryValue
    });

    if (nextAction === 'LOG_STEP') {
      setSecondaryLogDraft(currentSecondaryValue || '');
      setOpenSecondaryLogEditor(stepId);
    }
  };

  const saveGridSteps = () => {
    const validSteps = gridSteps.filter(step => step.test_step_description.trim() !== '');
    if (validSteps.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one test step with description",
        variant: "destructive"
      });
      return;
    }
    
    onTestStepsChange([...testSteps, ...validSteps]);
    setGridSteps([]);
    setShowGrid(false);
    toast({
      title: "Success",
      description: `${validSteps.length} test step(s) added successfully!`,
    });
  };

  const cancelGridMode = () => {
    setGridSteps([]);
    setShowGrid(false);
  };

  const deleteGridStep = (stepId: number) => {
    const updatedSteps = gridSteps.filter(step => step.id !== stepId);
    const reorderedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));
    setGridSteps(reorderedSteps);
  };

  const handleCreateStep = async () => {
    if (!formData.test_step_description.trim()) {
      toast({
        title: "Error",
        description: "Test step description is required",
        variant: "destructive"
      });
      return;
    }

    try {
      // Extract TC ID from the selected test case's testcase_id
      const tcId = selectedTestCase?.testcase_id ? 
        selectedTestCase.testcase_id.split('_').pop() || 'TC001' : 'TC001';

      const newStep: TestStep = {
        id: Date.now(),
        tc_id: formData.tc_id || tcId,
        step_no: formData.step_no,
        test_step_description: formData.test_step_description,
        element_name: formData.element_name,
        action_type: formData.action_type,
        assertion_type: formData.assertion_type || '',
        secondary_action: formData.secondary_action || '',
        secondary_value: formData.secondary_value || '',
        xpath: formData.xpath,
        values: formData.values
      };

      if (editingStep) {
        const updatedSteps = testSteps.map(step => 
          step.id === editingStep.id ? { ...newStep, id: editingStep.id } : step
        );
        onTestStepsChange(updatedSteps);
        setEditingStep(null);
        toast({
          title: "Success",
          description: "Test step updated successfully!",
        });
      } else {
        onTestStepsChange([...testSteps, newStep]);
        toast({
          title: "Success",
          description: "Test step created successfully!",
        });
      }

      resetForm();
      setIsCreateModalOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save test step",
        variant: "destructive"
      });
    }
  };

  const handleEditStep = (step: TestStep) => {
    setEditingStep(step);
    setFormData({
      tc_id: step.tc_id,
      step_no: step.step_no,
      test_step_description: step.test_step_description,
      element_name: step.element_name,
      action_type: normalizeActionType(step.action_type),
      assertion_type: normalizeActionType(step.action_type) === 'HANDLE' ? getHandleLabel(step.action_type, step.assertion_type) : (step.assertion_type || ''),
      secondary_action: step.secondary_action || '',
      secondary_value: step.secondary_value || '',
      xpath: step.xpath,
      values: step.values
    });
    setIsCreateModalOpen(true);
  };

  const handleDeleteStep = (stepId: number) => {
    console.log('Attempting to delete step with ID:', stepId);
    console.log('Current test steps:', testSteps);
    
    try {
      const updatedSteps = testSteps.filter(step => step.id !== stepId);
      console.log('Updated steps after deletion:', updatedSteps);
      
      // Reorder step numbers after deletion
      const reorderedSteps = updatedSteps.map((step, index) => ({
        ...step,
        step_no: index + 1
      }));
      
      onTestStepsChange(reorderedSteps);
      toast({
        title: "Success",
        description: "Test step deleted successfully!",
      });
    } catch (error) {
      console.error('Error deleting step:', error);
      toast({
        title: "Error",
        description: "Failed to delete test step",
        variant: "destructive"
      });
    }
  };

  const handleInsertAfter = (afterStepId: number) => {
    const currentStepIndex = testSteps.findIndex(step => step.id === afterStepId);
    if (currentStepIndex === -1) return;

    const tcId = selectedTestCase?.testcase_id ? 
      selectedTestCase.testcase_id.split('_').pop() || 'TC001' : 'TC001';

    const newStep: TestStep = {
      id: Date.now() + Math.random(),
      tc_id: tcId,
      step_no: currentStepIndex + 2, // Will be renumbered
      test_step_description: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    };

    // Insert the new step after the current step
    const updatedSteps = [
      ...testSteps.slice(0, currentStepIndex + 1),
      newStep,
      ...testSteps.slice(currentStepIndex + 1)
    ];

    // Renumber all steps
    const renumberedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));

    onTestStepsChange(renumberedSteps);
    
    // Open edit dialog for the new step
    setEditingStep(newStep);
    setFormData({
      tc_id: tcId,
      step_no: currentStepIndex + 2,
      test_step_description: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      secondary_action: '',
      secondary_value: '',
      xpath: '',
      values: ''
    });
    setIsCreateModalOpen(true);

    toast({
      title: "Success",
      description: "New test step inserted! Please configure it.",
    });
  };

  const handleMoveUp = (stepId: number) => {
    const currentIndex = testSteps.findIndex(step => step.id === stepId);
    if (currentIndex <= 0) return; // Can't move up if it's the first item

    const updatedSteps = [...testSteps];
    // Swap with previous step
    [updatedSteps[currentIndex - 1], updatedSteps[currentIndex]] = 
    [updatedSteps[currentIndex], updatedSteps[currentIndex - 1]];

    // Renumber all steps
    const renumberedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));

    onTestStepsChange(renumberedSteps);
    toast({
      title: "Success",
      description: "Test step moved up!",
    });
  };

  const handleMoveDown = (stepId: number) => {
    const currentIndex = testSteps.findIndex(step => step.id === stepId);
    if (currentIndex >= testSteps.length - 1) return; // Can't move down if it's the last item

    const updatedSteps = [...testSteps];
    // Swap with next step
    [updatedSteps[currentIndex], updatedSteps[currentIndex + 1]] = 
    [updatedSteps[currentIndex + 1], updatedSteps[currentIndex]];

    // Renumber all steps
    const renumberedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));

    onTestStepsChange(renumberedSteps);
    toast({
      title: "Success",
      description: "Test step moved down!",
    });
  };

  const handleSaveConfiguration = async () => {
    if (testSteps.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one test step",
        variant: "destructive"
      });
      return;
    }

    try {
      // TODO: Save to database table
      toast({
        title: "Success",
        description: `Configuration saved to ${selectedTestCase.name} table in Ixigo_TestAutomation database!`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive"
      });
    }
  };

  // In developmentMode we allow configuring steps without a pre-selected test case
  if (!selectedTestCase && !developmentMode) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <p className="text-gray-600">Please select a test case first</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Modules" />

      {/* Header Section */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-gray-900 flex items-center space-x-2">
                <Settings className="w-6 h-6 text-blue-600" />
                <span>{developmentMode ? `Configure Steps - ${selectedModule?.name || selectedModule?.module_name || 'New Test Case'}` : `Configure "${selectedTestCase.name}"`}</span>
              </CardTitle>
              <p className="text-gray-600 mt-2">{developmentMode ? 'Add and organize steps for your new test case' : 'Define test steps and actions for your test case'}</p>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleSaveConfiguration} className="bg-blue-500 hover:bg-blue-600">
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </Button>
              <Button 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                onClick={() => {
                  setShowGrid(true);
                  if (gridSteps.length === 0) {
                    addMoreSteps();
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Test Steps
              </Button>

            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Edit Step Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="bg-white border-gray-200 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {editingStep ? 'Edit Test Step' : 'Add New Test Step'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600">TC ID</label>
              <Input
                value={formData.tc_id}
                onChange={(e) => setFormData({ ...formData, tc_id: e.target.value })}
                placeholder="TC001"
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Step No</label>
              <Input
                type="number"
                value={formData.step_no}
                onChange={(e) => setFormData({ ...formData, step_no: parseInt(e.target.value) || 1 })}
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-600">Test Step Description</label>
              <Textarea
                value={formData.test_step_description}
                onChange={(e) => setFormData({ ...formData, test_step_description: e.target.value })}
                placeholder="Describe what this step does"
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Element Name</label>
              <Input
                value={formData.element_name}
                onChange={(e) => setFormData({ ...formData, element_name: e.target.value })}
                placeholder="ElementName"
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <div className="relative">
              <label className="text-sm font-medium text-gray-600">Action Type</label>
              <select
                value={formData.action_type}
                onChange={(e) => setFormData({
                  ...formData,
                  action_type: e.target.value,
                  values: normalizeActionType(e.target.value) === 'PRESS_KEY' ? (formData.values || 'ENTER') : formData.values,
                  assertion_type:
                    normalizeActionType(e.target.value) === 'ASSERTION'
                      ? (formData.assertion_type || 'ELEMENT_VISIBLE')
                      : normalizeActionType(e.target.value) === 'HANDLE'
                        ? getHandleLabel(e.target.value, formData.assertion_type)
                        : formData.assertion_type
                })}
                onClick={() => (isPressKeyAction(formData.action_type) || isAssertionAction(formData.action_type) || isHandleAction(formData.action_type)) && setOpenPressKeyPicker('form')}
                className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-900"
              >
                {ACTION_TYPES.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
              {isPressKeyAction(formData.action_type) && (
                <div className="mt-1 text-xs font-medium text-purple-700">
                  Key: {formData.values || 'ENTER'}
                </div>
              )}
              {isAssertionAction(formData.action_type) && (
                <div className="mt-1 text-xs font-medium text-amber-700">
                  Assertion: {getAssertionLabel(formData.assertion_type)}
                </div>
              )}
              {isHandleAction(formData.action_type) && (
                <div className="mt-1 text-xs font-medium text-emerald-700">
                  Handle: {getHandleDisplayLabel(formData.assertion_type)}
                </div>
              )}
              {(isPressKeyAction(formData.action_type) || isAssertionAction(formData.action_type) || isHandleAction(formData.action_type)) && openPressKeyPicker === 'form' && (
                <div className="absolute bottom-0 left-full z-20 ml-2 w-48 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                  {(isPressKeyAction(formData.action_type) ? PRESS_KEY_OPTIONS : isAssertionAction(formData.action_type) ? ASSERTION_OPTIONS : HANDLE_OPTIONS).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setFormData(
                          isPressKeyAction(formData.action_type)
                            ? { ...formData, values: option }
                            : { ...formData, assertion_type: option }
                        );
                        setOpenPressKeyPicker(null);
                      }}
                      className={`block w-full rounded px-3 py-2 text-left text-sm ${
                        (isPressKeyAction(formData.action_type)
                          ? (formData.values || 'ENTER')
                          : isAssertionAction(formData.action_type)
                            ? getAssertionLabel(formData.assertion_type)
                            : getHandleLabel(formData.action_type, formData.assertion_type)) === option
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-gray-700 hover:bg-purple-50'
                      }`}
                    >
                      {isHandleAction(formData.action_type) ? getHandleDisplayLabel(option) : option}
                    </button>
                  ))}
                </div>
              )}
              {openAutoGenFormatPicker === 'form' && (
                <div className="absolute bottom-0 left-full z-20 ml-52 w-56 rounded-md border border-sky-200 bg-white p-1 shadow-lg">
                  {getTemporalFormatOptions(formData.element_name).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          values: generateTemporalValue(format),
                          secondary_action: 'AUTO_GENERATE_VALUE',
                          secondary_value: ''
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
              <p className="text-xs text-gray-500 mt-1">
                {normalizeActionType(formData.action_type) === 'OPEN_BROWSER' && 'Use Values for URL (e.g. https://example.com).'}
                {normalizeActionType(formData.action_type) === 'CLICK_AND_SELECT' && 'Use for selection flows (city/date/age) with Values as the input.'}
                {normalizeActionType(formData.action_type) === 'SELECT_COUNT' && 'Use for count updates (rooms/adults/children/infants) with numeric Values.'}
                {normalizeActionType(formData.action_type) === 'INCREMENT' && 'Use Values as step count (default 1) to increase counters.'}
                {normalizeActionType(formData.action_type) === 'DECREMENT' && 'Use Values as step count (default 1) to decrease counters.'}
                {normalizeActionType(formData.action_type) === 'CLICK' && 'Use for pure click actions where no selection/input is needed.'}
                {normalizeActionType(formData.action_type) === 'CLICK_AND_TYPE' && 'Clicks the element and types the text from Values. Auto-GenValue can insert smart text, or open a date/time format picker for temporal fields.'}
                {normalizeActionType(formData.action_type) === 'TYPE_AND_SELECT' && 'Types Values into the field, waits for the dropdown/autocomplete, then picks the same or closest matching option.'}
                {normalizeActionType(formData.action_type) === 'CLEAR_AND_TYPE' && 'Clears existing/default value, then types Values. Auto-GenValue can insert smart text, or open a date/time format picker for temporal fields.'}
                {normalizeActionType(formData.action_type) === 'READ_TEXT' && 'Reads visible text from the target. Optionally put expected text in Values.'}
                {normalizeActionType(formData.action_type) === 'READ_VALUE' && 'Reads the input value from the target. Optionally put expected value in Values.'}
                {normalizeActionType(formData.action_type) === 'READ_TOOLTIP' && 'Reads tooltip/title/aria-label text. Optionally put expected tooltip in Values.'}
                {normalizeActionType(formData.action_type) === 'READ_LABEL' && 'Reads the label associated with the target element. Optionally put expected label in Values.'}
                {normalizeActionType(formData.action_type) === 'COPY' && 'Copies selected text from the target element. Use Values only if you want expected text validation.'}
                {normalizeActionType(formData.action_type) === 'PASTE' && 'Pastes clipboard contents into the target, or pastes the text from Values when provided.'}
                {normalizeActionType(formData.action_type) === 'UPLOAD_FILE' && 'Use Values as the file path to upload.'}
                {normalizeActionType(formData.action_type) === 'DOWNLOAD_FILE' && 'Clicks the target to download a file. Optionally use Values as expected filename text.'}
                {normalizeActionType(formData.action_type) === 'HANDLE' && getHandleLabel(formData.action_type, formData.assertion_type) === 'HANDLE_ALERT_DIALOG' && 'Use Values like accept, dismiss, contains=message, or text=prompt value.'}
                {normalizeActionType(formData.action_type) === 'HANDLE' && getHandleLabel(formData.action_type, formData.assertion_type) === 'HANDLE_CONFIRMATION' && 'Use Values like accept or dismiss, and optionally contains=message to verify the confirmation text.'}
                {normalizeActionType(formData.action_type) === 'HANDLE' && getHandleLabel(formData.action_type, formData.assertion_type) === 'HANDLE_NOTIFICATION' && 'Use XPath for a specific toast if available, or Values like contains=Saved, dismiss, or wait_gone.'}
                {normalizeActionType(formData.action_type) === 'HANDLE' && getHandleLabel(formData.action_type, formData.assertion_type) === 'HANDLE_OS_DIALOG' && 'Use Values like file=C:\\\\path\\\\file.ext for chooser flows, or print / type=print for print dialog flows.'}
                {normalizeActionType(formData.action_type) === 'VISUAL_ASSERTION' && 'Use Values like baseline=login_page;threshold=0.01 to compare the current screenshot with a stored baseline.'}
                {normalizeActionType(formData.action_type) === 'DOUBLE_CLICK' && 'Performs a double click on the target element.'}
                {normalizeActionType(formData.action_type) === 'RIGHT_CLICK' && 'Performs a context (right) click on the target element.'}
                {normalizeActionType(formData.action_type) === 'MOUSE_OVER' && 'Moves mouse over target element to trigger hover states.'}
                {normalizeActionType(formData.action_type) === 'RADIO_BUTTON' && 'Selects the target radio button (Values can be true/yes/1/select).' }
                {normalizeActionType(formData.action_type) === 'DRAG_AND_DROP' && 'Use XPath as source and Values as target locator (or target=...).'}
                {normalizeActionType(formData.action_type) === 'HANDLE_CHECKBOX' && 'Use Values: true/false, yes/no, or 1/0.'}
                {normalizeActionType(formData.action_type) === 'PRESS_KEY' && 'Choose a key action from the dropdown. It will be stored in Values automatically.'}
                {normalizeActionType(formData.action_type) === 'HANDLE' && 'Choose the handle target from the popup. Values stay available for dialog text, toast text, file path, or print mode.'}
                {normalizeActionType(formData.action_type) === 'ASSERTION' && 'Choose an assertion type from the popup. Use Values for the expected text, URL, title, or attribute=value when needed.'}
              </p>
            </div>
            <div className="relative">
              <label className="text-sm font-medium text-gray-600">Secondary Action</label>
              <select
                value={formData.secondary_action || ''}
                onChange={(e) => applyFormSecondaryAction(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-900"
              >
                {SECONDARY_ACTION_OPTIONS.map((action) => (
                  <option key={action || 'none'} value={action}>
                    {getSecondaryActionDisplayLabel(action)}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs font-medium text-rose-700">
                {formData.secondary_action === 'LOG_STEP'
                  ? `Saved Log: ${formData.secondary_value || 'Click "Edit Log" to add message'}`
                  : formData.secondary_action === 'AUTO_GENERATE_VALUE'
                    ? 'Generates a matching value directly into the Values box.'
                  : formData.secondary_action === 'TAKE_SCREENSHOT'
                    ? 'A screenshot will be captured after the primary action finishes.'
                    : 'Optional follow-up action after the main step.'}
              </div>
              {formData.secondary_action === 'LOG_STEP' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                  onClick={() => {
                    setSecondaryLogDraft(formData.secondary_value || '');
                    setOpenSecondaryLogEditor('form');
                  }}
                >
                  Edit Log
                </Button>
              )}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-600">Locator (XPath/CSS/ID)</label>
              <Input
                value={formData.xpath}
                onChange={(e) => setFormData({ ...formData, xpath: e.target.value })}
                placeholder="//div[@id='example'] or #myId or .myClass"
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use XPath, CSS selectors, or element IDs. The generic executor will auto-detect the type.
              </p>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-600">Values</label>
              <Input
                value={formData.values}
                onChange={(e) => setFormData({ ...formData, values: e.target.value })}
                placeholder={isPressKeyAction(formData.action_type) ? "Selected from key dropdown" : isAssertionAction(formData.action_type) ? "Expected text / URL / title / attribute=value" : isHandleAction(formData.action_type) ? "accept; contains=... / file=... / print" : "Enter values if needed"}
                className="bg-gray-50 border-gray-200 text-gray-900"
                disabled={isPressKeyAction(formData.action_type)}
              />
            </div>
            <div className="col-span-2 flex justify-end space-x-2">
              <Button variant="outline" onClick={() => {
                setIsCreateModalOpen(false);
                setEditingStep(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleCreateStep} className="bg-gradient-to-r from-blue-500 to-indigo-500">
                {editingStep ? 'Update Step' : 'Add Step'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openSecondaryLogEditor === 'form'} onOpenChange={(open) => {
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
                  setFormData({
                    ...formData,
                    secondary_action: '',
                    secondary_value: ''
                  });
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
                  setFormData({
                    ...formData,
                    secondary_action: 'LOG_STEP',
                    secondary_value: secondaryLogDraft
                  });
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

      {/* Grid Mode for Adding Multiple Test Steps */}
      {showGrid && (
        <Card className="bg-white backdrop-blur-sm border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900">Add Test Steps (Grid Mode)</CardTitle>
              <div className="flex space-x-2">
                <Button 
                  onClick={addMoreSteps}
                  className="bg-green-500 hover:bg-green-600"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add More Steps
                </Button>
                <Button 
                  onClick={saveGridSteps}
                  className="bg-blue-500 hover:bg-blue-600"
                  size="sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save All
                </Button>
                <Button 
                  onClick={cancelGridMode}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 text-gray-600">TC ID</th>
                    <th className="text-left py-3 px-2 text-gray-600">Step No</th>
                    <th className="text-left py-3 px-2 text-gray-600">Description</th>
                    <th className="text-left py-3 px-2 text-gray-600">Element</th>
                    <th className="text-left py-3 px-2 text-gray-600">Action</th>
                    <th className="text-left py-3 px-2 text-gray-600">Locator</th>
                    <th className="text-left py-3 px-2 text-gray-600">Values</th>
                    <th className="text-left py-3 px-2 text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gridSteps.map((step) => (
                    <tr key={step.id} className="border-b border-gray-100">
                      <td className="py-2 px-2">
                        <Input
                          value={step.tc_id}
                          onChange={(e) => updateGridStep(step.id, 'tc_id', e.target.value)}
                          className="h-8 text-xs"
                          placeholder="TC001"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={step.step_no}
                          onChange={(e) => updateGridStep(step.id, 'step_no', parseInt(e.target.value) || 1)}
                          className="h-8 text-xs w-16"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Textarea
                          value={step.test_step_description}
                          onChange={(e) => updateGridStep(step.id, 'test_step_description', e.target.value)}
                          className="h-8 text-xs min-h-8 resize-none"
                          placeholder="Test step description"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={step.element_name}
                          onChange={(e) => updateGridStep(step.id, 'element_name', e.target.value)}
                          className="h-8 text-xs"
                          placeholder="Element name"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <div className="relative">
                          <select
                                  value={normalizeActionType(step.action_type)}
                                  onChange={(e) => updateGridStep(step.id, 'action_type', e.target.value)}
                            onClick={() => (isPressKeyAction(step.action_type) || isAssertionAction(step.action_type) || isHandleAction(step.action_type)) && setOpenPressKeyPicker(step.id)}
                            className="w-full h-8 text-xs bg-white border border-gray-200 rounded-md px-2"
                          >
                            {ACTION_TYPES.map(action => (
                              <option key={action} value={action}>{action}</option>
                            ))}
                          </select>
                          {isPressKeyAction(step.action_type) && (
                            <div className="mt-1 text-[11px] font-medium text-purple-700">
                              Key: {step.values || 'ENTER'}
                            </div>
                          )}
                          {isAssertionAction(step.action_type) && (
                            <div className="mt-1 text-[11px] font-medium text-amber-700">
                              Assertion: {getAssertionLabel(step.assertion_type)}
                            </div>
                          )}
                          {isHandleAction(step.action_type) && (
                            <div className="mt-1 text-[11px] font-medium text-emerald-700">
                              Handle: {getHandleLabel(step.action_type, step.assertion_type)}
                            </div>
                          )}
                          {(isPressKeyAction(step.action_type) || isAssertionAction(step.action_type) || isHandleAction(step.action_type)) && openPressKeyPicker === step.id && (
                            <div className="absolute bottom-0 left-full z-20 ml-2 w-44 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                              {(isPressKeyAction(step.action_type) ? PRESS_KEY_OPTIONS : isAssertionAction(step.action_type) ? ASSERTION_OPTIONS : HANDLE_OPTIONS).map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    if (isPressKeyAction(step.action_type)) {
                                      updateGridStep(step.id, 'values', option);
                                    } else {
                                      updateGridStep(step.id, 'assertion_type', option);
                                    }
                                    setOpenPressKeyPicker(null);
                                  }}
                                  className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                                    (isPressKeyAction(step.action_type)
                                      ? (step.values || 'ENTER')
                                      : isAssertionAction(step.action_type)
                                        ? getAssertionLabel(step.assertion_type)
                                        : getHandleLabel(step.action_type, step.assertion_type)) === option
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'text-gray-700 hover:bg-purple-50'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          )}
                          <select
                            value={step.secondary_action || ''}
                            onChange={(e) => applyGridSecondaryAction(step.id, e.target.value, step.element_name, step.secondary_value || '')}
                            className="mt-2 w-full h-8 text-xs bg-white border border-rose-200 rounded-md px-2 text-gray-900"
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
                              className="mt-2 h-7 border-rose-200 px-2 text-[11px] text-rose-700 hover:bg-rose-50"
                              onClick={() => {
                                setSecondaryLogDraft(step.secondary_value || '');
                                setOpenSecondaryLogEditor(step.id);
                              }}
                            >
                              {step.secondary_value ? 'Edit Log' : 'Add Log'}
                            </Button>
                          )}
                          {step.secondary_action && (
                            <div className="mt-1 text-[11px] font-medium text-rose-700">
                              {step.secondary_action === 'LOG_STEP'
                                ? (step.secondary_value || 'No log message saved yet')
                                : step.secondary_action === 'AUTO_GENERATE_VALUE'
                                  ? 'Generates a matching value directly into the Values box'
                                : 'Screenshot will be taken after the main action'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={step.xpath}
                          onChange={(e) => updateGridStep(step.id, 'xpath', e.target.value)}
                          className="h-8 text-xs"
                          placeholder="Locator"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={step.values}
                          onChange={(e) => updateGridStep(step.id, 'values', e.target.value)}
                          className="h-8 text-xs"
                          placeholder={isPressKeyAction(step.action_type) ? "Selected from key dropdown" : isHandleAction(step.action_type) ? "accept; contains=... / file=... / print" : "Values"}
                          disabled={isPressKeyAction(step.action_type)}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 h-8 w-8 p-0"
                          onClick={() => deleteGridStep(step.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Steps Table */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Test Steps Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-600">TC ID</th>
                  <th className="text-left py-3 px-2 text-gray-600">Step No</th>
                  <th className="text-left py-3 px-2 text-gray-600">Description</th>
                  <th className="text-left py-3 px-2 text-gray-600">Element</th>
                  <th className="text-left py-3 px-2 text-gray-600">Action</th>
                  <th className="text-left py-3 px-2 text-gray-600">Locator</th>
                  <th className="text-left py-3 px-2 text-gray-600">Values</th>
                  <th className="text-left py-3 px-2 text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {testSteps.map((step) => (
                  <tr key={step.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 text-gray-900">{step.tc_id}</td>
                    <td className="py-3 px-2 text-gray-900">{step.step_no}</td>
                    <td className="py-3 px-2 text-gray-900 max-w-xs truncate">{step.test_step_description}</td>
                    <td className="py-3 px-2 text-gray-900">{step.element_name}</td>
                    <td className="py-3 px-2">
                      <Badge className="bg-blue-500/20 text-blue-600">{normalizeActionType(step.action_type)}</Badge>
                    </td>
                    <td className="py-3 px-2 text-gray-900 max-w-xs truncate">{step.xpath}</td>
                    <td className="py-3 px-2 text-gray-900">{step.values}</td>
                    <td className="py-3 px-2">
                      <div className="flex space-x-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => handleMoveUp(step.id)}
                          disabled={testSteps.findIndex(s => s.id === step.id) === 0}
                          title="Move Up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => handleMoveDown(step.id)}
                          disabled={testSteps.findIndex(s => s.id === step.id) === testSteps.length - 1}
                          title="Move Down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-green-600 hover:text-green-800 hover:bg-green-50"
                          onClick={() => handleInsertAfter(step.id)}
                          title="Insert Step After"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                          onClick={() => handleEditStep(step)}
                          title="Edit Step"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600 hover:text-red-800 hover:bg-red-50"
                          onClick={() => handleDeleteStep(step.id)}
                          title="Delete Step"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {testSteps.length === 0 && (
              <div className="text-center py-8 text-gray-600">
                No test steps configured yet. Click "Add Test Steps" to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={typeof openSecondaryLogEditor === 'number'} onOpenChange={(open) => {
        if (!open) {
          setOpenSecondaryLogEditor(null);
          setSecondaryLogDraft('');
        }
      }}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Grid Log Step Message</DialogTitle>
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
                  if (typeof openSecondaryLogEditor === 'number') {
                    updateGridStep(openSecondaryLogEditor, 'secondary_action', '');
                    updateGridStep(openSecondaryLogEditor, 'secondary_value', '');
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
                  if (typeof openSecondaryLogEditor === 'number') {
                    updateGridStep(openSecondaryLogEditor, 'secondary_action', 'LOG_STEP');
                    updateGridStep(openSecondaryLogEditor, 'secondary_value', secondaryLogDraft);
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

      {/* Navigation */}
      <div className="flex justify-end items-center">
        {testSteps.length > 0 && (
          <Button 
            onClick={onNext}
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
          >
            Review & Execute
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default TestConfigDashboard;
