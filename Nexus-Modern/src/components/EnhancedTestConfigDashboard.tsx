import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, PlusCircle, Save, Play, ArrowLeft } from 'lucide-react';
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
  xpath: string;
  values: string;
}

interface EnhancedTestConfigDashboardProps {
  selectedProject?: any;
  selectedModule?: any;
  testSteps?: TestStep[];
  onTestStepsChange?: (steps: TestStep[]) => void;
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
const getAssertionLabel = (assertionType?: string): string => assertionType || 'ELEMENT_VISIBLE';
const getHandleLabel = (actionType?: string, handleType?: string): string => {
  const rawAction = (actionType || '').toUpperCase().trim().replace(/[\s\-/]+/g, '_');
  if (HANDLE_OPTIONS.includes(rawAction)) return rawAction;
  const normalizedHandle = (handleType || '').toUpperCase().trim().replace(/[\s\-/]+/g, '_');
  return HANDLE_OPTIONS.includes(normalizedHandle) ? normalizedHandle : 'HANDLE_ALERT_DIALOG';
};

const EnhancedTestConfigDashboard: React.FC<EnhancedTestConfigDashboardProps> = ({ 
  selectedProject,
  selectedModule,
  testSteps = [],
  onTestStepsChange,
  onBack,
  developmentMode = false,
  onSave
}) => {
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openPressKeyPicker, setOpenPressKeyPicker] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setSteps(testSteps);
  }, [testSteps]);

  useEffect(() => {
    // Load existing test steps if any exist for this module
    loadExistingTestSteps();
  }, [selectedModule]);

  const loadExistingTestSteps = async () => {
    if (!selectedModule) return;
    
    try {
      setIsLoading(true);
      // Try to load any existing test steps for this module
      const response = await fetch(buildApiUrl(`/api/testcases?suite_type=general&module_id=${selectedModule.id}`));
      if (response.ok) {
        const data = await response.json();
        if (data.test_cases && data.test_cases.length > 0) {
          // Load steps from the first test case as a template
          const firstTestCase = data.test_cases[0];
          const stepsResponse = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(firstTestCase.name)}`));
          if (stepsResponse.ok) {
            const existingSteps = await stepsResponse.json();
            if (existingSteps.length > 0) {
              setSteps(existingSteps);
              onTestStepsChange?.(existingSteps);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading existing test steps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addNewStep = () => {
    const newStep: TestStep = {
      id: Date.now() + Math.random(),
      tc_id: 'TC001',
      step_no: steps.length + 1,
      test_step_description: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      xpath: '',
      values: ''
    };
    const updatedSteps = [...steps, newStep];
    setSteps(updatedSteps);
    onTestStepsChange?.(updatedSteps);
    setEditingStepId(newStep.id);
  };

  const insertStepAfter = (afterIndex: number) => {
    const newStep: TestStep = {
      id: Date.now() + Math.random(),
      tc_id: 'TC001',
      step_no: afterIndex + 2,
      test_step_description: '',
      element_name: '',
      action_type: 'CLICK',
      assertion_type: '',
      xpath: '',
      values: ''
    };
    
    const updatedSteps = [...steps];
    updatedSteps.splice(afterIndex + 1, 0, newStep);
    
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));
    
    setSteps(reorderedSteps);
    onTestStepsChange?.(reorderedSteps);
    setEditingStepId(newStep.id);
  };

  const updateStep = (stepId: number, field: keyof TestStep, value: string | number) => {
    const updatedSteps = steps.map(step =>
      step.id === stepId
        ? {
            ...step,
            [field]: field === 'action_type' ? normalizeActionType(String(value)) : value,
            ...(field === 'action_type' && normalizeActionType(String(value)) === 'PRESS_KEY' && !step.values ? { values: 'ENTER' } : {}),
            ...(field === 'action_type' && normalizeActionType(String(value)) === 'ASSERTION' && !step.assertion_type ? { assertion_type: 'ELEMENT_VISIBLE' } : {}),
            ...(field === 'action_type' && normalizeActionType(String(value)) === 'HANDLE' ? { assertion_type: getHandleLabel(String(value), step.assertion_type) } : {})
          }
        : step
    );
    if (field === 'action_type') {
      const normalizedAction = normalizeActionType(String(value));
      setOpenPressKeyPicker((normalizedAction === 'PRESS_KEY' || normalizedAction === 'ASSERTION' || normalizedAction === 'HANDLE') ? stepId : null);
    }
    setSteps(updatedSteps);
    onTestStepsChange?.(updatedSteps);
  };

  const deleteStep = (stepId: number) => {
    const updatedSteps = steps.filter(step => step.id !== stepId);
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, index) => ({
      ...step,
      step_no: index + 1
    }));
    setSteps(reorderedSteps);
    onTestStepsChange?.(reorderedSteps);
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    
    const updatedSteps = [...steps];
    [updatedSteps[index - 1], updatedSteps[index]] = [updatedSteps[index], updatedSteps[index - 1]];
    
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, idx) => ({
      ...step,
      step_no: idx + 1
    }));
    
    setSteps(reorderedSteps);
    onTestStepsChange?.(reorderedSteps);
  };

  const moveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    
    const updatedSteps = [...steps];
    [updatedSteps[index], updatedSteps[index + 1]] = [updatedSteps[index + 1], updatedSteps[index]];
    
    // Reorder step numbers
    const reorderedSteps = updatedSteps.map((step, idx) => ({
      ...step,
      step_no: idx + 1
    }));
    
    setSteps(reorderedSteps);
    onTestStepsChange?.(reorderedSteps);
  };

  const handleSave = () => {
    const validSteps = steps.filter(step => step.test_step_description.trim() !== '');
    if (validSteps.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one test step with description",
        variant: "destructive"
      });
      return;
    }
    
    onSave?.();
  };

  if (isLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="text-gray-600">Loading test steps...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Modules" />

      {/* Header */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">
                Create and organize test steps for {selectedModule?.module_name || selectedModule?.name}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                onClick={addNewStep}
                className="bg-green-500 hover:bg-green-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Step
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Test Steps Grid */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">
            Test Steps ({steps.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Test Steps</h3>
              <p className="text-gray-500 mb-4">Start by adding your first test step</p>
              <Button 
                onClick={addNewStep}
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Step
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step, index) => (
                <Card key={step.id} className="border border-gray-200 hover:border-gray-300 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-4">
                      {/* Step Number */}
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {step.step_no}
                      </div>

                      {/* Step Content */}
                      <div className="flex-1 space-y-3">
                        {editingStepId === step.id ? (
                          // Edit Mode
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Test Step Description *
                              </label>
                              <Textarea
                                value={step.test_step_description}
                                onChange={(e) => updateStep(step.id, 'test_step_description', e.target.value)}
                                placeholder="Describe what this step does..."
                                className="w-full"
                                rows={2}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Element Name
                              </label>
                              <Input
                                value={step.element_name}
                                onChange={(e) => updateStep(step.id, 'element_name', e.target.value)}
                                placeholder="Element identifier"
                              />
                            </div>
                            <div className="relative">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Action Type
                              </label>
                              <select
                                value={normalizeActionType(step.action_type)}
                                onChange={(e) => updateStep(step.id, 'action_type', e.target.value)}
                                onClick={() => (isPressKeyAction(step.action_type) || isAssertionAction(step.action_type) || isHandleAction(step.action_type)) && setOpenPressKeyPicker(step.id)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                                  Handle: {getHandleLabel(step.action_type, step.assertion_type)}
                                </div>
                              )}
                              {(isPressKeyAction(step.action_type) || isAssertionAction(step.action_type) || isHandleAction(step.action_type)) && openPressKeyPicker === step.id && (
                                <div className="absolute bottom-0 left-full z-20 ml-2 w-48 rounded-md border border-gray-300 bg-white p-1 shadow-lg">
                                  {(isPressKeyAction(step.action_type) ? PRESS_KEY_OPTIONS : isAssertionAction(step.action_type) ? ASSERTION_OPTIONS : HANDLE_OPTIONS).map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => {
                                        if (isPressKeyAction(step.action_type)) {
                                          updateStep(step.id, 'values', option);
                                        } else {
                                          updateStep(step.id, 'assertion_type', option);
                                        }
                                        setOpenPressKeyPicker(null);
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
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Values
                              </label>
                              <Input
                                value={step.values}
                                onChange={(e) => updateStep(step.id, 'values', e.target.value)}
                                placeholder={isPressKeyAction(step.action_type) ? "Selected from key dropdown" : isAssertionAction(step.action_type) ? "Expected text / URL / title / attribute=value" : isHandleAction(step.action_type) ? "accept; contains=... / file=... / print" : "Input values"}
                                disabled={isPressKeyAction(step.action_type)}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                XPath
                              </label>
                              <Input
                                value={step.xpath}
                                onChange={(e) => updateStep(step.id, 'xpath', e.target.value)}
                                placeholder="Element XPath"
                                className="font-mono text-sm"
                              />
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">
                              {step.test_step_description || 'No description'}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                              <div>
                                <span className="font-medium">Element:</span> {step.element_name || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">Action:</span> 
                                <Badge variant="secondary" className="ml-2">{normalizeActionType(step.action_type)}</Badge>
                              </div>
                              <div>
                                <span className="font-medium">Values:</span> {step.values || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">XPath:</span> 
                                <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
                                  {step.xpath || 'N/A'}
                                </code>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col space-y-2">
                        {editingStepId === step.id ? (
                          <Button
                            size="sm"
                            onClick={() => setEditingStepId(null)}
                            className="bg-green-500 hover:bg-green-600"
                          >
                            Done
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingStepId(step.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        
                        <div className="flex flex-col space-y-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => moveStepUp(index)}
                            disabled={index === 0}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => moveStepDown(index)}
                            disabled={index === steps.length - 1}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => insertStepAfter(index)}
                          className="border-green-200 text-green-600"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteStep(step.id)}
                          className="border-red-200 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="flex items-center justify-end">
        <div className="flex items-center space-x-2">
          <Button 
            onClick={addNewStep}
            variant="outline"
            className="border-green-200 text-green-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Another Step
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedTestConfigDashboard;
