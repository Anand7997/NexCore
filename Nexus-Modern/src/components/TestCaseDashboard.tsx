import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { Plus, Edit, Trash2, TestTube, ArrowRight, ArrowLeft, Database, Eye, List, Save, FileText, Download, Search, Filter, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import TestStepsGrid, { TestStepsGridRef } from './TestStepsGrid';
import PageBackButton from '@/components/ui/page-back-button';

const BRD_AI_MODELS = [
    { value: 'gpt-5.5', label: 'gpt-5.5', note: 'Latest flagship' },
    { value: 'gpt-5.4', label: 'gpt-5.4', note: 'Latest balanced' },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini', note: 'Fast / lower cost' },
    { value: 'gpt-5.4-nano', label: 'gpt-5.4-nano', note: 'Fastest compact' },
    { value: 'gpt-5.2-pro', label: 'gpt-5.2-pro', note: 'Legacy deep' },
    { value: 'gpt-5.2', label: 'gpt-5.2', note: 'Legacy medium' },
    { value: 'gpt-5.1', label: 'gpt-5.1', note: 'Legacy strong' },
    { value: 'gpt-5', label: 'gpt-5', note: 'Legacy balanced' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini', note: 'Legacy fast' },
    { value: 'gpt-5-nano', label: 'gpt-5-nano', note: 'Legacy budget' },
    { value: 'gpt-4.1', label: 'gpt-4.1', note: 'Legacy stable' },
];

// Global timeout for auto-save debouncing
declare global {
    interface Window {
        testStepsAutoSaveTimeout: ReturnType<typeof setTimeout>;
    }
}

interface TestCase {
    id: number;
    testcase_id: string;
    name: string;
    description: string;
    project_id: number;
    module_id: number;
    project_name?: string;
    module_name?: string;
    project?: string;
    module?: string;
    created_date: string;
    status: string;
    priority: string;
}

interface TestStep {
    id: number;
    tc_id: string;
    step_no: number;
    test_step_description: string;
    page?: string;
    element_name: string;
    action_type: string;
    xpath: string;
    values: string;
}

interface GenerationSummary {
    coverage_score: number;
    coverage_rating: string;
    testcases_count: number;
    teststeps_count: number;
    avg_steps_per_testcase: number;
    suite_types_used: string[];
    priorities_used: string[];
    coverage_signals: Record<string, boolean>;
    generation_explanation?: {
        summary?: string;
        source_basis?: string[];
        generation_strategy?: string[];
        coverage_strategy?: string[];
        manual_creation_comparison?: string[];
        assumptions?: string[];
        review_recommendations?: string[];
    };
    coverage_report?: {
        covered_areas?: Array<{ area?: string; evidence?: string }>;
        scenario_mix?: Array<{ type?: string; count?: number; examples?: string[] }>;
        risk_coverage?: Array<{ risk?: string; coverage?: string }>;
        requirement_traceability?: Array<{ requirement_or_rule?: string; testcases?: string[] }>;
        gaps_or_followups?: string[];
    };
}

interface BrdScenario {
    scenario_id: number;
    name: string;
    description: string;
    priority?: string;
    suite_type?: string;
    testcases_count?: number;
    steps_count?: number;
    test_steps?: any[];
    testcases?: any[];
}

interface TestCaseDashboardProps {
    selectedProject: any;
    selectedModule: any;
    selectedTestSuite?: any;
    onTestCaseSelect?: (testCase: TestCase) => void;
    onNext?: () => void;
    onBack?: () => void;
    readOnlyMode?: boolean;
    highlightTestCase?: string; // Name of test case to highlight (from development sync)
    developmentMode?: boolean; // Special mode for automation development
}

const TestCaseDashboard: React.FC<TestCaseDashboardProps> = ({
    selectedProject,
    selectedModule,
    selectedTestSuite,
    onTestCaseSelect,
    onNext,
    onBack,
    readOnlyMode = false,
    highlightTestCase,
    developmentMode = false
}) => {
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [isLoadingTestCases, setIsLoadingTestCases] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
    const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        priority: 'Medium'
    });
    const [showTestSteps, setShowTestSteps] = useState(false);
    const [testSteps, setTestSteps] = useState<TestStep[]>([]);
    const [viewingTestCase, setViewingTestCase] = useState<TestCase | null>(null);
    const [editingSteps, setEditingSteps] = useState(false);
    const [isLoadingSteps, setIsLoadingSteps] = useState(false); // Track when steps are being loaded from DB
    const testStepsGridRef = useRef<TestStepsGridRef>(null);
    const { toast } = useToast();

    // BRD Selection state
    const [brdFiles, setBrdFiles] = useState<any[]>([]);
    const [brdPanelOpen, setBrdPanelOpen] = useState(false);
    const [brdSearchTerm, setBrdSearchTerm] = useState('');
    const [brdFilterUploadMode, setBrdFilterUploadMode] = useState<string>('all');
    const [brdFilterType, setBrdFilterType] = useState<string>('all');
    const [selectedBrdFiles, setSelectedBrdFiles] = useState<any[]>([]);
    const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
    const [selectedAiModel, setSelectedAiModel] = useState<string>('gpt-5.5');
    const [isGeneratingTestcases, setIsGeneratingTestcases] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationStage, setGenerationStage] = useState('Preparing request...');
    const [isGenerationSummaryOpen, setIsGenerationSummaryOpen] = useState(false);
    const [lastGenerationSummary, setLastGenerationSummary] = useState<GenerationSummary | null>(null);
    const [lastGenerationModel, setLastGenerationModel] = useState<string>('');
    const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false);
    const [brdScenarios, setBrdScenarios] = useState<BrdScenario[]>([]);
    const [selectedBrdScenarioIds, setSelectedBrdScenarioIds] = useState<number[]>([]);
    const [pendingGenerationMode, setPendingGenerationMode] = useState<'ai' | 'direct'>('ai');
    const [pendingGenerationModel, setPendingGenerationModel] = useState<string>('');
    const generationProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const generationStartedAtRef = useRef<number>(0);

    useEffect(() => {
        if (selectedModule) {
            fetchTestCases();
        }
    }, [selectedModule]);

    // Cleanup auto-save timeout on unmount
    useEffect(() => {
        return () => {
            if (window.testStepsAutoSaveTimeout) {
                clearTimeout(window.testStepsAutoSaveTimeout);
            }
            if (generationProgressTimerRef.current) {
                clearInterval(generationProgressTimerRef.current);
            }
        };
    }, []);

    const getGenerationBufferTargetMs = (generationMode: 'ai' | 'direct', modelName?: string) => {
        if (generationMode === 'direct') return 25000;

        switch ((modelName || selectedAiModel || '').toLowerCase()) {
            case 'gpt-5.5':
            case 'gpt-5.2-pro':
                return 420000;
            case 'gpt-5.4':
                return 300000;
            case 'gpt-5.2':
                return 240000;
            case 'gpt-5':
            case 'gpt-5.1':
                return 180000;
            case 'gpt-4.1':
                return 150000;
            case 'gpt-5.4-mini':
            case 'gpt-5-mini':
                return 30000;
            case 'gpt-5.4-nano':
            case 'gpt-5-nano':
                return 12000;
            default:
                return 120000;
        }
    };

    const getGenerationStageText = (generationMode: 'ai' | 'direct', modelName: string, progress: number) => {
        if (generationMode === 'direct') {
            if (progress < 18) return 'Checking selected files...';
            if (progress < 42) return 'Reading structured test case rows...';
            if (progress < 68) return 'Building test cases and test steps...';
            if (progress < 88) return 'Saving generated data...';
            return 'Waiting for save confirmation...';
        }

        if (progress < 15) return 'Checking selected BRD files...';
        if (progress < 30) return 'Extracting BRD content...';
        if (progress < 45) return `Sending request to ${modelName}...`;
        if (progress < 78) return 'Generating test cases, steps, and coverage report...';
        if (progress < 92) return 'Saving generated data and report...';
        return 'Waiting for final response...';
    };

    const startGenerationProgress = (generationMode: 'ai' | 'direct', modelName?: string) => {
        if (generationProgressTimerRef.current) {
            clearInterval(generationProgressTimerRef.current);
        }

        const activeModel = modelName || selectedAiModel;
        const targetMs = getGenerationBufferTargetMs(generationMode, activeModel);
        const startedAt = Date.now();
        generationStartedAtRef.current = startedAt;

        setGenerationProgress(6);
        setGenerationStage(getGenerationStageText(generationMode, activeModel, 6));
        setIsGeneratingTestcases(true);

        generationProgressTimerRef.current = setInterval(() => {
            const elapsedMs = Date.now() - startedAt;
            const ratio = Math.min(elapsedMs / targetMs, 1);
            const easedRatio = 1 - Math.pow(1 - ratio, 2.2);
            const baseProgress = Math.round(6 + easedRatio * 88);
            const slowCreep = ratio >= 1 ? Math.min(4, Math.floor((elapsedMs - targetMs) / 30000)) : 0;
            const nextProgress = Math.min(98, baseProgress + slowCreep);

            setGenerationProgress((previousProgress) => {
                const smoothedProgress = Math.max(previousProgress, nextProgress);
                setGenerationStage(getGenerationStageText(generationMode, activeModel, smoothedProgress));
                return smoothedProgress;
            });
        }, 1000);
    };

    const finishGenerationProgress = (success: boolean) => {
        if (generationProgressTimerRef.current) {
            clearInterval(generationProgressTimerRef.current);
            generationProgressTimerRef.current = null;
        }

        if (success) {
            setGenerationProgress(100);
            setGenerationStage('Completed successfully.');
            setTimeout(() => {
                setIsGeneratingTestcases(false);
                setGenerationProgress(0);
                setGenerationStage('Preparing request...');
            }, 600);
            return;
        }

        setIsGeneratingTestcases(false);
        setGenerationProgress(0);
        setGenerationStage('Preparing request...');
    };

    const fetchTestCases = async () => {
        try {
            setIsLoadingTestCases(true);
            console.log('Current selectedModule:', selectedModule);
            console.log('Current selectedProject:', selectedProject);
            
            const startTime = performance.now();
            
            // Use the new optimized bulk endpoint for a single API call
            const suiteTypes = ['general', 'automation', 'development', 'smoke', 'sanity', 'regression'];
            const suiteTypesParam = suiteTypes.join(',');
            
            console.log('Fetching test cases using optimized bulk endpoint...');
            
            try {
                const apiUrl = buildApiUrl(`/api/testcases/bulk?suite_types=${encodeURIComponent(suiteTypesParam)}&module_id=${selectedModule.id}`);
                console.log('Bulk API URL:', apiUrl);
                
                const response = await fetch(apiUrl);
                if (response.ok) {
                    const data = await response.json();
                    const testCases = data.test_cases || [];
                    
                    const endTime = performance.now();
                    console.log(`✅ Bulk fetch: Found ${testCases.length} test cases in ${(endTime - startTime).toFixed(2)}ms`);
                    console.log(`Suite types queried: ${data.suite_types_queried?.join(', ')}`);
                    
                    setTestCases(testCases);
                    return;
                } else {
                    console.warn('Bulk endpoint failed, falling back to parallel individual calls');
                }
            } catch (bulkError) {
                console.warn('Bulk endpoint error, falling back to parallel individual calls:', bulkError);
            }
            
            // Fallback: Use parallel individual calls if bulk endpoint fails
            console.log('Using fallback: parallel individual API calls...');
            
            const promises = suiteTypes.map(async (suiteType) => {
                try {
                    const apiUrl = buildApiUrl(`/api/testcases?suite_type=${suiteType}&module_id=${selectedModule.id}`);
                    const response = await fetch(apiUrl);
                    if (response.ok) {
                        const data = await response.json();
                        return {
                            suiteType,
                            testCases: data.test_cases || [],
                            success: true
                        };
                    }
                    return { suiteType, testCases: [], success: false };
                } catch (err) {
                    console.log(`Error with suite_type ${suiteType}:`, err);
                    return { suiteType, testCases: [], success: false };
                }
            });
            
            const results = await Promise.allSettled(promises);
            
            let allTestCases: TestCase[] = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.success) {
                    const { suiteType, testCases } = result.value;
                    if (testCases.length > 0) {
                        console.log(`Found ${testCases.length} test cases with suite_type: ${suiteType}`);
                        allTestCases = [...allTestCases, ...testCases];
                    }
                }
            });
            
            // Remove duplicates based on id
            const uniqueTestCases = allTestCases.reduce((unique: TestCase[], testCase: TestCase) => {
                if (!unique.find(tc => tc.id === testCase.id)) {
                    unique.push(testCase);
                }
                return unique;
            }, []);
            
            const endTime = performance.now();
            console.log(`⚡ Parallel fetch: Found ${uniqueTestCases.length} unique test cases in ${(endTime - startTime).toFixed(2)}ms`);
            
            setTestCases(uniqueTestCases);
            
        } catch (error) {
            console.error('Error fetching test cases:', error);
            setTestCases([]);
        } finally {
            setIsLoadingTestCases(false);
        }
    };

    const fetchTestSteps = async (testCase: TestCase) => {
        try {
            setIsLoadingSteps(true); // Prevent auto-save during loading
            const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(testCase.name)}`));
            if (response.ok) {
                const steps = await response.json();
                setTestSteps(steps || []);
                setViewingTestCase(testCase);
                setShowTestSteps(true);
                setEditingSteps(false);
            } else {
                // If no test steps exist, still show the view to allow creating them
                setTestSteps([]);
                setViewingTestCase(testCase);
                setShowTestSteps(true);
                setEditingSteps(false);
            }
        } catch (error) {
            console.error('Error fetching test steps:', error);
            setTestSteps([]);
            setViewingTestCase(testCase);
            setShowTestSteps(true);
            setEditingSteps(false);
        } finally {
            setIsLoadingSteps(false); // Allow auto-save after loading
        }
    };

    const saveTestSteps = async () => {
        if (!viewingTestCase) return;

        try {
            const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(viewingTestCase.name)}/bulk`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: viewingTestCase.id,
                    clear_existing: true, // overwrite existing steps
                    project_name: viewingTestCase.project_name || viewingTestCase.project,
                    module_name: viewingTestCase.module_name || viewingTestCase.module,
                    steps: testSteps.map((step, idx) => ({
                        // ensure consistent shape for backend
                        tc_id: viewingTestCase.name,
                        step_no: idx + 1,
                        test_step_description: step.test_step_description || '',
                        page: (step as any).page || '',
                        element_name: step.element_name || '',
                        action_type: step.action_type || 'CLICK',
                        xpath: step.xpath || '',
                        values: step.values || ''
                    }))
                })
            });

            if (response.ok) {
                setEditingSteps(false);
                toast({
                    title: "Success",
                    description: "Test steps saved successfully!",
                });
                // Refresh test steps from server
                await fetchTestSteps(viewingTestCase);
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error || 'Failed to save test steps');
            }
        } catch (error) {
            console.error('Error saving test steps:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to save test steps",
                variant: "destructive"
            });
        }
    };

    const handleCreateTestCase = async () => {
        if (!formData.name.trim()) {
            toast({
                title: "Error",
                description: "Test case name is required",
                variant: "destructive"
            });
            return;
        }

        try {
            const response = await fetch(buildApiUrl('/api/testcases'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    suite_type: 'general',
                    module_id: selectedModule?.id,
                    project_name: selectedProject?.name || selectedProject?.project_name,
                    module_name: selectedModule?.module_name || selectedModule?.name,
                    name: formData.name,
                    description: formData.description,
                    priority: formData.priority,
                    status: 'Active'
                }),
            });

            if (response.ok) {
                const result = await response.json();
                // Refresh the test cases list
                await fetchTestCases();
                setFormData({ name: '', description: '', priority: 'Medium' });
                setIsCreateModalOpen(false);

                toast({
                    title: "Success",
                    description: `Test case "${formData.name}" created successfully!`,
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to create test case",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error creating test case:', error);
            toast({
                title: "Error",
                description: "Failed to connect to backend API",
                variant: "destructive"
            });
        }
    };

    const handleEditTestCase = (testCase: TestCase) => {
        setEditingTestCase(testCase);
        setFormData({
            name: testCase.name,
            description: testCase.description,
            priority: testCase.priority
        });
        setIsEditModalOpen(true);
    };

    const handleUpdateTestCase = async () => {
        if (!editingTestCase || !formData.name.trim()) {
            toast({
                title: "Error",
                description: "Test case name is required",
                variant: "destructive"
            });
            return;
        }

        try {
            const response = await fetch(buildApiUrl(`/api/testcases/${editingTestCase.id}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                    priority: formData.priority,
                    module_id: editingTestCase.module_id,
                    project_name: selectedProject?.name || selectedProject?.project_name,
                    module_name: selectedModule?.module_name || selectedModule?.name,
                    suite_type: 'general'
                })
            });

            if (response.ok) {
                await fetchTestCases();
                setIsEditModalOpen(false);
                setEditingTestCase(null);
                setFormData({ name: '', description: '', priority: 'Medium' });
                toast({
                    title: "Success",
                    description: "Testcase updated successfully!",
                });
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update testcase');
            }
        } catch (error) {
            console.error('Update error:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to update testcase",
                variant: "destructive"
            });
        }
    };

    const handleDeleteTestCase = async (testCase: TestCase) => {
        if (!window.confirm(`Are you sure you want to delete "${testCase.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(buildApiUrl(`/api/testcases/${testCase.id}`), {
                method: 'DELETE'
            });

            if (response.ok) {
                await fetchTestCases();
                toast({
                    title: "Success",
                    description: "Testcase deleted successfully!",
                });
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete testcase');
            }
        } catch (error) {
            console.error('Delete error:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to delete testcase",
                variant: "destructive"
            });
        }
    };

    const handleTestCaseSelect = (testCase: TestCase) => {
        setSelectedTestCase(testCase);
        if (developmentMode) {
            // In development mode, directly show test steps in read-only
            fetchTestSteps(testCase);
        } else {
            onTestCaseSelect(testCase);
        }
    };

    const handleCleanupOrphanedData = async () => {
        if (!window.confirm('This will permanently delete all orphaned test execution data that no longer has corresponding test cases. Are you sure?')) {
            return;
        }

        try {
            const response = await fetch(buildApiUrl('/api/cleanup-orphaned-data'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const result = await response.json();
                toast({
                    title: "Success",
                    description: `Cleanup completed! Deleted ${result.details.total_deleted} orphaned records.`,
                });
                // Refresh test cases to ensure clean state
                await fetchTestCases();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to cleanup orphaned data');
            }
        } catch (error) {
            console.error('Cleanup error:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to cleanup orphaned data",
                variant: "destructive"
            });
        }
    };

    const getSelectedUploadMode = () => {
        const selectedUploadModes = Array.from(
            new Set(
                selectedBrdFiles
                    .map(file => (file.upload_mode || 'brd-generation') as string)
                    .filter(Boolean)
            )
        );

        if (selectedUploadModes.length > 1) {
            return { error: "Please select files from only one Type at a time: either BRD Test Generation [AI] or Direct Test Implementation." };
        }

        return { uploadMode: selectedUploadModes[0] || 'brd-generation' };
    };

    const generateTestcasesWithMode = async (generationMode: 'ai' | 'direct', selectedModel?: string, approvedTestcases?: BrdScenario[]) => {
        try {
            startGenerationProgress(generationMode, selectedModel);
            toast({
                title: "Generating Test Cases",
                description: approvedTestcases?.length
                    ? `Generating test cases from ${approvedTestcases.length} selected BRD scenario${approvedTestcases.length !== 1 ? 's' : ''}...`
                    : generationMode === 'direct'
                    ? "Processing files for direct implementation..."
                    : `Processing BRD documents with ${selectedModel || selectedAiModel}...`,
            });

            const response = await fetch(buildApiUrl('/api/generate-testcases-from-brd'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': localStorage.getItem('qfast_user') ? JSON.parse(localStorage.getItem('qfast_user')!).email : '',
                },
                body: JSON.stringify({
                    brd_files: selectedBrdFiles.map(file => ({ id: file.id, name: file.file_name })),
                    generation_mode: generationMode,
                    selected_model: generationMode === 'ai' ? (selectedModel || selectedAiModel) : undefined,
                    approved_testcases: approvedTestcases,
                    project_id: selectedProject?.id,
                    module_id: selectedModule?.id
                })
            });

            if (response.ok) {
                const result = await response.json();
                const modelNote = generationMode === 'ai' && result.model_used
                    ? ` Generated using model: ${result.model_used}.`
                    : '';
                setLastGenerationSummary(result.generation_summary || null);
                setLastGenerationModel(result.model_used || '');
                setIsGenerationSummaryOpen(true);
                toast({
                    title: "Success",
                    description: `Generated ${result.generated_testcases.length} test cases from BRD documents!${modelNote}`,
                });

                await fetchTestCases();
                setSelectedBrdFiles([]);
                setBrdScenarios([]);
                setSelectedBrdScenarioIds([]);
                setIsScenarioDialogOpen(false);
                setBrdPanelOpen(false);
                setIsModelDialogOpen(false);
                finishGenerationProgress(true);
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
                throw new Error(errorData.error || 'Failed to generate test cases');
            }
        } catch (error) {
            finishGenerationProgress(false);
            console.error('Generate testcase error:', error);

            let errorMessage = "Failed to generate test cases from BRD";

            if (error instanceof Error) {
                if (error.message.includes('OpenAI API error')) {
                    errorMessage = "OpenAI service temporarily unavailable. Please try again later.";
                } else if (error.message.includes('JSON')) {
                    errorMessage = "AI response format error. Please try again.";
                } else if (error.message.includes('Authentication')) {
                    errorMessage = "Authentication failed. Please check your login.";
                } else if (error.message.includes('No BRD files selected')) {
                    errorMessage = "Please select at least one BRD document first.";
                } else if (error.message.includes('No readable content')) {
                    errorMessage = "Selected BRD files contain no readable content.";
                } else {
                    errorMessage = error.message;
                }
            }

            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive"
            });
        }
    };

    const previewBrdScenarios = async (generationMode: 'ai' | 'direct', selectedModel?: string) => {
        try {
            startGenerationProgress(generationMode, selectedModel);
            toast({
                title: "Reading BRD Scenarios",
                description: generationMode === 'direct'
                    ? "Extracting scenarios from structured files..."
                    : `Extracting scenarios from BRD documents with ${selectedModel || selectedAiModel}...`,
            });

            const response = await fetch(buildApiUrl('/api/generate-testcases-from-brd'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': localStorage.getItem('qfast_user') ? JSON.parse(localStorage.getItem('qfast_user')!).email : '',
                },
                body: JSON.stringify({
                    brd_files: selectedBrdFiles.map(file => ({ id: file.id, name: file.file_name })),
                    generation_mode: generationMode,
                    selected_model: generationMode === 'ai' ? (selectedModel || selectedAiModel) : undefined,
                    preview_scenarios: true,
                    project_id: selectedProject?.id,
                    module_id: selectedModule?.id
                })
            });

            if (response.ok) {
                const result = await response.json();
                const scenarios = result.scenarios || [];
                setBrdScenarios(scenarios);
                setSelectedBrdScenarioIds(scenarios.map((scenario: BrdScenario) => scenario.scenario_id));
                setPendingGenerationMode(generationMode);
                setPendingGenerationModel(result.model_used || selectedModel || selectedAiModel || '');
                setIsModelDialogOpen(false);
                setBrdPanelOpen(false);
                setIsScenarioDialogOpen(true);
                finishGenerationProgress(true);
                toast({
                    title: "Scenarios Ready",
                    description: `Found ${scenarios.length} BRD scenario${scenarios.length !== 1 ? 's' : ''}. Select the ones to generate.`,
                });
                return;
            }

            const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
            throw new Error(errorData.error || 'Failed to extract BRD scenarios');
        } catch (error) {
            finishGenerationProgress(false);
            console.error('Preview BRD scenarios error:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to extract BRD scenarios",
                variant: "destructive"
            });
        }
    };

    const toggleBrdScenario = (scenarioId: number) => {
        setSelectedBrdScenarioIds(prev =>
            prev.includes(scenarioId)
                ? prev.filter(id => id !== scenarioId)
                : [...prev, scenarioId]
        );
    };

    const handleGenerateSelectedScenarios = async () => {
        const approvedScenarios = brdScenarios.filter(scenario => selectedBrdScenarioIds.includes(scenario.scenario_id));
        if (approvedScenarios.length === 0) {
            toast({
                title: "Error",
                description: "Please select at least one BRD scenario",
                variant: "destructive"
            });
            return;
        }

        const approvedTestcases = approvedScenarios.flatMap((scenario) => {
            if (Array.isArray(scenario.testcases) && scenario.testcases.length > 0) {
                return scenario.testcases;
            }
            return [scenario];
        });

        await generateTestcasesWithMode(pendingGenerationMode, pendingGenerationModel || selectedAiModel, approvedTestcases);
    };

    const handleGenerateTestcase = async () => {
        if (selectedBrdFiles.length === 0) {
            toast({
                title: "Error",
                description: "Please select at least one BRD document first",
                variant: "destructive"
            });
            return;
        }

        const { uploadMode, error } = getSelectedUploadMode();
        if (error) {
            toast({
                title: "Error",
                description: error,
                variant: "destructive"
            });
            return;
        }

        if (uploadMode === 'direct-implementation') {
            await previewBrdScenarios('direct');
            return;
        }

        setIsModelDialogOpen(true);
    };

    const handleProceed = () => {
        if (!selectedTestCase) {
            toast({
                title: "Error",
                description: "Please select a test case to proceed",
                variant: "destructive"
            });
            return;
        }
        onNext();
    };

    // BRD Functions
    const loadBrdFiles = async () => {
        try {
            const response = await fetch(buildApiUrl('/api/brd/files'), {
                method: 'GET',
                headers: {
                    'X-User-Email': localStorage.getItem('qfast_user') ? JSON.parse(localStorage.getItem('qfast_user')!).email : '',
                },
            });

            if (response.ok) {
                const result = await response.json();
                setBrdFiles(result.files || []);
            }
        } catch (error) {
            console.error('Error loading BRD files:', error);
        }
    };

    const handleBrdDownload = async (fileId: number, fileName: string) => {
        try {
            const response = await fetch(buildApiUrl(`/api/brd/download/${fileId}`), {
                method: 'GET',
                headers: {
                    'X-User-Email': localStorage.getItem('qfast_user') ? JSON.parse(localStorage.getItem('qfast_user')!).email : '',
                },
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Error downloading BRD file:', error);
        }
    };

    const handleBrdFileSelect = (file: any) => {
        setSelectedBrdFiles(prev => {
            const isSelected = prev.some(f => f.id === file.id);
            if (isSelected) {
                return prev.filter(f => f.id !== file.id);
            } else {
                return [...prev, file];
            }
        });
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const filteredBrdFiles = brdFiles.filter(file => {
        const matchesSearch = file.file_name.toLowerCase().includes(brdSearchTerm.toLowerCase()) ||
                             file.original_name.toLowerCase().includes(brdSearchTerm.toLowerCase());
        const matchesUploadMode = brdFilterUploadMode === 'all' || file.upload_mode === brdFilterUploadMode;
        const matchesType = brdFilterType === 'all' || file.file_type === brdFilterType;
        return matchesSearch && matchesUploadMode && matchesType;
    });

    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'high': return 'bg-red-500/20 text-red-600';
            case 'medium': return 'bg-yellow-500/20 text-yellow-600';
            case 'low': return 'bg-green-500/20 text-green-600';
            default: return 'bg-gray-500/20 text-gray-600';
        }
    };

    const renderTestStepsView = () => (
        <div className="space-y-6">
            {/* Header */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl text-gray-900 flex items-center space-x-2">
                                <List className="w-6 h-6 text-purple-600" />
                                <span>Test Steps - {viewingTestCase?.name}</span>
                            </CardTitle>
                            <p className="text-gray-600 mt-2">
                                {developmentMode 
                                    ? '📖 Read-Only Mode: Test steps cannot be edited in development mode' 
                                    : editingSteps 
                                        ? 'Edit and manage test steps with full CRUD operations' 
                                        : 'View test step details for this test case'
                                }
                            </p>
                            {developmentMode && (
                                <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <p className="text-orange-700 text-sm">
                                        <strong>Development Mode:</strong> Test case and steps are read-only. 
                                        Use the main development workflow to create and manage test steps.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="flex space-x-2">
                            {editingSteps ? (
                                <>
                                    <Button
                                        onClick={saveTestSteps}
                                        className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Changes
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => setEditingSteps(false)}
                                        className="border-gray-300 text-gray-600"
                                    >
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                !developmentMode && (
                                    <Button
                                        onClick={() => setEditingSteps(true)}
                                        className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                                    >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit Steps
                                    </Button>
                                )
                            )}
                            <Button
                                variant="outline"
                                onClick={() => setShowTestSteps(false)}
                                className="border-gray-200 text-gray-600"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Test Cases
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Test Steps Content */}
            {editingSteps && !developmentMode ? (
                <>
                    {/* Add New Step Button */}
                    <div className="flex justify-end">
                        <Button
                            onClick={() => testStepsGridRef.current?.addNewStep()}
                            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add New Step
                        </Button>
                    </div>

                    {/* Editable Test Steps Grid */}
                    <TestStepsGrid
                        ref={testStepsGridRef}
                        selectedProject={selectedProject}
                        selectedModule={selectedModule}
                        testSteps={testSteps}
                        testCaseName={viewingTestCase?.name}
                        onTestStepsChange={(steps) => {
                            // Update local state immediately
                            setTestSteps(steps);

                            // Skip auto-save if steps are currently being loaded from database
                            if (isLoadingSteps) {
                                console.log('⏭️ [Auto-Save Skipped] Steps are being loaded from database');
                                return;
                            }

                            // Debounced auto-save to prevent race conditions
                            if (!viewingTestCase) return;

                            // Clear any existing timeout
                            if (window.testStepsAutoSaveTimeout) {
                                clearTimeout(window.testStepsAutoSaveTimeout);
                            }

                            // Set a new timeout for auto-save (500ms delay)
                            window.testStepsAutoSaveTimeout = setTimeout(async () => {
                                try {
                                    console.log('💾 [Auto-Save] Saving test steps to database...');
                                    const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(viewingTestCase.name)}/bulk`), {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            id: viewingTestCase.id,
                                            clear_existing: true,
                                            project_name: viewingTestCase.project_name || viewingTestCase.project,
                                            module_name: viewingTestCase.module_name || viewingTestCase.module,
                                            steps: steps.map((step, idx) => ({
                                                tc_id: viewingTestCase.name,
                                                step_no: idx + 1,
                                                test_step_description: step.test_step_description || '',
                                                page: (step as any).page || '',
                                                element_name: step.element_name || '',
                                                action_type: step.action_type || 'CLICK',
                                                xpath: step.xpath || '',
                                                values: step.values || ''
                                            }))
                                        })
                                    });

                                    if (response.ok) {
                                        console.log('💾 [Auto-Save Success] Test steps auto-saved to database');
                                    } else {
                                        const errorData = await response.json().catch(() => ({}));
                                        console.error('❌ [Auto-Save Failed]', errorData?.error || 'Failed to auto-save test steps');
                                    }
                                } catch (error) {
                                    console.error('❌ [Auto-Save Error]', error);
                                }
                            }, 500);
                        }}
                        readOnlyMode={developmentMode}
                        onAutoXPathRefresh={async (steps) => {
                            // Skip auto-save if steps are currently being loaded from database
                            if (isLoadingSteps) {
                                console.log('⏭️ [XPath Auto-Save Skipped] Steps are being loaded from database');
                                return;
                            }

                            // Create a temporary state update for saving
                            const stepsToBeSaved = steps;
                            if (!viewingTestCase) return;

                            try {
                                const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(viewingTestCase.name)}/bulk`), {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        id: viewingTestCase.id,
                                        clear_existing: true,
                                        project_name: viewingTestCase.project_name || viewingTestCase.project,
                                        module_name: viewingTestCase.module_name || viewingTestCase.module,
                                        steps: stepsToBeSaved.map((step, idx) => ({
                                            tc_id: viewingTestCase.name,
                                            step_no: idx + 1,
                                            test_step_description: step.test_step_description || '',
                                            page: (step as any).page || '',
                                            element_name: step.element_name || '',
                                            action_type: step.action_type || 'CLICK',
                                            xpath: step.xpath || '',
                                            values: step.values || ''
                                        }))
                                    })
                                });

                                if (response.ok) {
                                    console.log('💾 [Auto-Save Success] XPath changes auto-saved to database');
                                } else {
                                    const errorData = await response.json().catch(() => ({}));
                                    console.error('❌ [Auto-Save Failed]', errorData?.error || 'Failed to auto-save XPath changes');
                                }
                            } catch (error) {
                                console.error('❌ [Auto-Save Error]', error);
                            }
                        }}
                    />
                </>
            ) : (
                /* Read-only Test Steps View */
                <Card className="bg-white backdrop-blur-sm border-gray-200">
                    <CardHeader>
                        <CardTitle className="text-lg text-gray-900">Test Steps ({testSteps.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {testSteps.length === 0 ? (
                            <div className="text-center py-8">
                                <List className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600">
                                    {developmentMode 
                                        ? "No test steps found for this test case. Test steps are read-only in development mode." 
                                        : "No test steps found for this test case"
                                    }
                                </p>
                                {!developmentMode && (
                                    <Button
                                        onClick={() => setEditingSteps(true)}
                                        className="mt-4 bg-gradient-to-r from-blue-500 to-indigo-500"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add First Step
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {testSteps.map((step, index) => (
                                    <Card key={step.id} className="border border-gray-200">
                                        <CardContent className="p-4">
                                            <div className="flex items-start space-x-4">
                                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                                    {step.step_no}
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <span className="font-medium text-gray-700">Description:</span>
                                                    <h4 className="font-semibold text-gray-900">{step.test_step_description}</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                        <div>
                                                            <span className="font-medium text-gray-700">Element:</span>
                                                            <p className="text-gray-600">{step.element_name || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Page:</span>
                                                            <p className="text-gray-600">{step.page|| 'N/A'}</p>
                                                        </div>
                                                        <div>

                                                            <span className="font-medium text-gray-700">Action:</span>
                                                            <p className="text-gray-600">{step.action_type || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">XPath:</span>
                                                            <p className="text-gray-600 font-mono text-xs break-all">{step.xpath || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Values:</span>
                                                            <p className="text-gray-600">{step.values || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );

    const normalizeSummaryList = (value: unknown): string[] => {
        if (Array.isArray(value)) {
            return value
                .map((item) => String(item || '').trim())
                .filter(Boolean);
        }
        if (typeof value === 'string' && value.trim()) {
            return [value.trim()];
        }
        return [];
    };

    const renderSummaryList = (title: string, value: unknown) => {
        const items = normalizeSummaryList(value);
        if (!items.length) {
            return null;
        }

        return (
            <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">{title}</p>
                <ul className="space-y-1 text-sm text-gray-700 list-disc pl-5">
                    {items.map((item, index) => (
                        <li key={`${title}-${index}`}>{item}</li>
                    ))}
                </ul>
            </div>
        );
    };

    if (!selectedModule) {
        return (
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardContent className="p-8 text-center">
                    <p className="text-gray-600">Please select a module first</p>
                </CardContent>
            </Card>
        );
    }

    if (showTestSteps) {
        return renderTestStepsView();
    }

    return (
        <div className="testcase-dashboard-theme space-y-6">
            <PageBackButton onClick={onBack} label="Back to Modules" />

            {/* Header Section */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            {developmentMode ? (
                                <h3 className="font-semibold tracking-tight text-lg text-gray-900">Test Cases</h3>
                            ) : (
                                <CardTitle className="text-2xl text-gray-900 flex items-center space-x-2">
                                    <TestTube className="w-6 h-6 text-blue-600" />
                                    <span>Test Cases - {selectedModule?.module_name || selectedModule?.name}</span>
                                </CardTitle>
                            )}
                            <p className="text-gray-600 mt-2">Manage test cases from Automation Planning, Development, and Execution phases</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {!readOnlyMode && (
                            <div className="flex space-x-2">
                                <Sheet open={brdPanelOpen} onOpenChange={setBrdPanelOpen}>
                                    <SheetTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="border-blue-200 text-blue-600 hover:bg-blue-50"
                                            onClick={() => {
                                                loadBrdFiles();
                                                setBrdPanelOpen(true);
                                            }}
                                        >
                                            <FileText className="w-4 h-4 mr-2" />
                                            Select Document
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent className="flex h-full w-[400px] flex-col gap-0 overflow-hidden bg-white p-0 sm:w-[540px] sm:max-w-[540px]">
                                        <SheetHeader className="shrink-0 border-b border-gray-200 px-6 py-5 pr-12">
                                            <SheetTitle className="text-gray-900">Select BRD Documents</SheetTitle>
                                            <p className="text-sm text-gray-600">Choose BRD documents to associate with your test cases</p>
                                        </SheetHeader>

                                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
                                            {/* Search and Filter */}
                                            <div className="shrink-0 space-y-4 py-5">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                                    <Input
                                                        placeholder="Search BRD files..."
                                                        value={brdSearchTerm}
                                                        onChange={(e) => setBrdSearchTerm(e.target.value)}
                                                        className="pl-10 bg-gray-50 border-gray-200"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <Filter className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-600 min-w-12">Type</span>
                                                        <select
                                                            value={brdFilterUploadMode}
                                                            onChange={(e) => setBrdFilterUploadMode(e.target.value)}
                                                            className="flex-1 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900"
                                                        >
                                                            <option value="all">All Types</option>
                                                            <option value="brd-generation">BRD Test Generation [AI]</option>
                                                            <option value="direct-implementation">Direct Test Implementation</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <Filter className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm text-gray-600 min-w-12">Format</span>
                                                        <select
                                                            value={brdFilterType}
                                                            onChange={(e) => setBrdFilterType(e.target.value)}
                                                            className="flex-1 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900"
                                                        >
                                                            <option value="all">All Formats</option>
                                                            <option value="document">Documents (.doc, .docx)</option>
                                                            <option value="pdf">PDF Files</option>
                                                            <option value="excel">Excel Files</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Selected Files Summary */}
                                            {selectedBrdFiles.length > 0 && (
                                                <div className="mb-4 shrink-0 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium text-blue-900">
                                                            {selectedBrdFiles.length} file{selectedBrdFiles.length !== 1 ? 's' : ''} selected
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setSelectedBrdFiles([])}
                                                            className="text-blue-600 hover:text-blue-800"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* BRD Files List */}
                                            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4 pr-1">
                                            {filteredBrdFiles.length === 0 ? (
                                                <div className="text-center py-8">
                                                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                                    <p className="text-gray-600">
                                                        {brdFiles.length === 0 ? 'No BRD files uploaded yet' : 'No files match your search'}
                                                    </p>
                                                </div>
                                            ) : (
                                                filteredBrdFiles.map((file) => (
                                                    <div
                                                        key={file.id}
                                                        className={`
                                                            flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all
                                                            ${selectedBrdFiles.some(f => f.id === file.id)
                                                                ? 'bg-blue-50 border-blue-300'
                                                                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                                            }
                                                        `}
                                                        onClick={() => handleBrdFileSelect(file)}
                                                    >
                                                        <div className="flex items-center space-x-3 flex-1">
                                                            <div className={`
                                                                w-8 h-8 rounded-full flex items-center justify-center
                                                                ${file.file_type === 'document' ? 'bg-blue-100 text-blue-600' :
                                                                  file.file_type === 'pdf' ? 'bg-red-100 text-red-600' :
                                                                  'bg-green-100 text-green-600'}
                                                            `}>
                                                                <FileText className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-medium text-gray-900 truncate">{file.file_name}</p>
                                                                <p className="text-sm text-gray-600 truncate">{file.original_name}</p>
                                                                <div className="flex items-center space-x-2 mt-1">
                                                                    <span className="text-xs text-gray-500 uppercase">{file.file_type}</span>
                                                                    <span className="text-xs text-gray-500">{formatFileSize(file.file_size)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleBrdDownload(file.id, file.original_name);
                                                                }}
                                                                className="text-gray-600 hover:text-gray-900"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </Button>
                                                            {selectedBrdFiles.some(f => f.id === file.id) && (
                                                                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                                                                    <div className="w-2 h-2 bg-white rounded-full"></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4 flex justify-end space-x-2">
                                            <Button variant="outline" onClick={() => setBrdPanelOpen(false)}>
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    // Here you can handle what to do with selected BRD files
                                                    toast({
                                                        title: "BRD Selection",
                                                        description: `Selected ${selectedBrdFiles.length} BRD file${selectedBrdFiles.length !== 1 ? 's' : ''}`,
                                                    });
                                                    setBrdPanelOpen(false);
                                                }}
                                                className="bg-blue-600 hover:bg-blue-700"
                                            >
                                                Select Files ({selectedBrdFiles.length})
                                            </Button>
                                        </div>
                                    </SheetContent>
                                </Sheet>
                                <Button
                                    onClick={handleGenerateTestcase}
                                    disabled={selectedBrdFiles.length === 0 || isGeneratingTestcases}
                                    className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50"
                                >
                                    {isGeneratingTestcases ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <TestTube className="w-4 h-4 mr-2" />
                                    )}
                                    {isGeneratingTestcases ? 'Generating...' : 'Generate Testcase'}
                                </Button>
                                <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
                                    <DialogContent className="bg-white border-gray-200">
                                        <DialogHeader>
                                            <DialogTitle className="text-gray-900">Choose AI Model</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <p className="text-sm text-gray-600">
                                                Select the OpenAI model to use for BRD Test Generation [AI]. The generated output will include test cases and test steps.
                                            </p>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-900">Model</label>
                                                <select
                                                    value={selectedAiModel}
                                                    onChange={(e) => setSelectedAiModel(e.target.value)}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900"
                                                >
                                                    {BRD_AI_MODELS.map((model) => (
                                                        <option key={model.value} value={model.value}>
                                                            {model.label} - {model.note}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                                <p className="text-sm text-blue-900">
                                                    Selected model: <span className="font-semibold">{selectedAiModel}</span>
                                                </p>
                                                <p className="mt-1 text-xs text-blue-800">
                                                    Use gpt-5.5 for highest quality. Use gpt-5.4-mini or gpt-5.4-nano for faster, lower-cost runs.
                                                </p>
                                            </div>
                                            <div className="flex justify-end space-x-2">
                                                <Button variant="outline" onClick={() => setIsModelDialogOpen(false)}>
                                                    Cancel
                                                </Button>
                                                <Button
                                                    onClick={() => previewBrdScenarios('ai', selectedAiModel)}
                                                    className="bg-blue-600 hover:bg-blue-700"
                                                >
                                                    Show BRD Scenarios
                                                </Button>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                                <Dialog open={isScenarioDialogOpen} onOpenChange={setIsScenarioDialogOpen}>
                                    <DialogContent className="bg-white border-gray-200 sm:max-w-4xl max-h-[85vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle className="text-gray-900">Select BRD Scenarios</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                                <p className="text-sm text-blue-900">
                                                    Pick the BRD scenarios to generate test cases from. Select all if you want complete coverage.
                                                </p>
                                                <p className="mt-1 text-xs text-blue-800">
                                                    {selectedBrdScenarioIds.length} of {brdScenarios.length} scenario{brdScenarios.length !== 1 ? 's' : ''} selected
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setSelectedBrdScenarioIds(brdScenarios.map(scenario => scenario.scenario_id))}
                                                    >
                                                        Select All
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setSelectedBrdScenarioIds([])}
                                                    >
                                                        Clear
                                                    </Button>
                                                </div>
                                                {pendingGenerationModel && (
                                                    <span className="text-xs text-gray-500">Model: {pendingGenerationModel}</span>
                                                )}
                                            </div>
                                            <div className="space-y-3">
                                                {brdScenarios.map((scenario) => {
                                                    const checked = selectedBrdScenarioIds.includes(scenario.scenario_id);
                                                    return (
                                                        <button
                                                            key={scenario.scenario_id}
                                                            type="button"
                                                            onClick={() => toggleBrdScenario(scenario.scenario_id)}
                                                            className={`w-full rounded-lg border p-4 text-left transition-colors ${
                                                                checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => toggleBrdScenario(scenario.scenario_id)}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <p className="font-semibold text-gray-900">{scenario.name}</p>
                                                                        {scenario.priority && (
                                                                            <Badge variant="secondary">{scenario.priority}</Badge>
                                                                        )}
                                                                        {scenario.suite_type && (
                                                                            <Badge variant="outline">{scenario.suite_type}</Badge>
                                                                        )}
                                                                        <span className="text-xs text-gray-500">
                                                                            {scenario.testcases_count || 1} testcase{scenario.testcases_count === 1 ? '' : 's'}
                                                                        </span>
                                                                        <span className="text-xs text-gray-500">
                                                                            {scenario.steps_count || 0} step{scenario.steps_count === 1 ? '' : 's'}
                                                                        </span>
                                                                    </div>
                                                                    {scenario.description && (
                                                                        <p className="mt-2 text-sm leading-6 text-gray-700">{scenario.description}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" onClick={() => setIsScenarioDialogOpen(false)}>
                                                    Cancel
                                                </Button>
                                                <Button
                                                    onClick={handleGenerateSelectedScenarios}
                                                    disabled={selectedBrdScenarioIds.length === 0 || isGeneratingTestcases}
                                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {isGeneratingTestcases ? (
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <TestTube className="w-4 h-4 mr-2" />
                                                    )}
                                                    Generate Selected ({selectedBrdScenarioIds.length})
                                                </Button>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                                <Dialog open={isGeneratingTestcases}>
                                    <DialogContent className="bg-white border-gray-200 sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                                        <DialogHeader>
                                            <DialogTitle className="text-gray-900 flex items-center gap-2">
                                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                                Generating Test Cases
                                            </DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <p className="text-sm text-gray-600">
                                                {generationStage}
                                            </p>
                                            <Progress value={generationProgress} className="h-3" />
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <span>{generationProgress}%</span>
                                                <span>{selectedBrdFiles.length} file{selectedBrdFiles.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                                                {getSelectedUploadMode().uploadMode === 'direct-implementation'
                                                    ? 'Direct implementation is processing your selected structured files.'
                                                    : `BRD Test Generation [AI] is using ${selectedAiModel} to generate detailed test cases, test steps, and a coverage report.`}
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                                <Dialog open={isGenerationSummaryOpen} onOpenChange={setIsGenerationSummaryOpen}>
                                    <DialogContent className="bg-white border-gray-200 sm:max-w-4xl max-h-[85vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle className="text-gray-900">Generation Explanation & Coverage Report</DialogTitle>
                                        </DialogHeader>
                                        {lastGenerationSummary && (
                                            <div className="space-y-4">
                                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium text-emerald-900">Coverage Rating</span>
                                                        <span className="text-lg font-bold text-emerald-700">
                                                            {lastGenerationSummary.coverage_rating} ({lastGenerationSummary.coverage_score}/100)
                                                        </span>
                                                    </div>
                                                    {lastGenerationModel && (
                                                        <p className="mt-2 text-sm text-emerald-900">
                                                            Model used: <span className="font-semibold">{lastGenerationModel}</span>
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div className="rounded-lg border border-gray-200 p-3">
                                                        <p className="text-gray-500">Test Cases</p>
                                                        <p className="text-lg font-semibold text-gray-900">{lastGenerationSummary.testcases_count}</p>
                                                    </div>
                                                    <div className="rounded-lg border border-gray-200 p-3">
                                                        <p className="text-gray-500">Test Steps</p>
                                                        <p className="text-lg font-semibold text-gray-900">{lastGenerationSummary.teststeps_count}</p>
                                                    </div>
                                                    <div className="rounded-lg border border-gray-200 p-3">
                                                        <p className="text-gray-500">Avg Steps / Case</p>
                                                        <p className="text-lg font-semibold text-gray-900">{lastGenerationSummary.avg_steps_per_testcase}</p>
                                                    </div>
                                                    <div className="rounded-lg border border-gray-200 p-3">
                                                        <p className="text-gray-500">Suite Types</p>
                                                        <p className="text-sm font-semibold text-gray-900">
                                                            {lastGenerationSummary.suite_types_used.join(', ') || 'n/a'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-gray-200 p-3">
                                                    <p className="text-sm font-medium text-gray-900 mb-2">Coverage Signals</p>
                                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                                        {Object.entries(lastGenerationSummary.coverage_signals).map(([key, value]) => (
                                                            <div key={key} className={`rounded-md px-2 py-1 ${value ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                                                                {key.charAt(0).toUpperCase() + key.slice(1)}: {value ? 'Covered' : 'Low'}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                {lastGenerationSummary.generation_explanation && (
                                                    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-900 mb-2">Detailed Generation Explanation</p>
                                                            <p className="text-sm text-gray-700 leading-6">
                                                                {lastGenerationSummary.generation_explanation.summary || 'Generated from selected BRD content and saved under the selected project/module.'}
                                                            </p>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {renderSummaryList('Source Basis', lastGenerationSummary.generation_explanation.source_basis)}
                                                            {renderSummaryList('Generation Strategy', lastGenerationSummary.generation_explanation.generation_strategy)}
                                                            {renderSummaryList('Coverage Strategy', lastGenerationSummary.generation_explanation.coverage_strategy)}
                                                            {renderSummaryList('Manual Creation Comparison', lastGenerationSummary.generation_explanation.manual_creation_comparison)}
                                                            {renderSummaryList('Assumptions', lastGenerationSummary.generation_explanation.assumptions)}
                                                            {renderSummaryList('Review Recommendations', lastGenerationSummary.generation_explanation.review_recommendations)}
                                                        </div>
                                                    </div>
                                                )}
                                                {lastGenerationSummary.coverage_report && (
                                                    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                                                        <p className="text-sm font-semibold text-gray-900">Coverage Report</p>
                                                        {!!lastGenerationSummary.coverage_report.covered_areas?.length && (
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 mb-2">Covered Areas</p>
                                                                <div className="space-y-2">
                                                                    {lastGenerationSummary.coverage_report.covered_areas.slice(0, 10).map((item, index) => (
                                                                        <div key={`covered-area-${index}`} className="rounded-md bg-gray-50 p-3 text-sm">
                                                                            <p className="font-semibold text-gray-900">{item.area || 'Covered Area'}</p>
                                                                            <p className="text-gray-700">{item.evidence || 'Covered by generated test cases.'}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!!lastGenerationSummary.coverage_report.scenario_mix?.length && (
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 mb-2">Scenario Mix</p>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                    {lastGenerationSummary.coverage_report.scenario_mix.map((item, index) => (
                                                                        <div key={`scenario-mix-${index}`} className="rounded-md border border-gray-100 p-3 text-sm">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-semibold text-gray-900">{item.type || 'Scenario'}</span>
                                                                                <span className="text-gray-500">{item.count ?? 0}</span>
                                                                            </div>
                                                                            {!!item.examples?.length && (
                                                                                <p className="mt-1 text-gray-600">{item.examples.slice(0, 3).join(', ')}</p>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!!lastGenerationSummary.coverage_report.risk_coverage?.length && (
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 mb-2">Risk Coverage</p>
                                                                <div className="space-y-2">
                                                                    {lastGenerationSummary.coverage_report.risk_coverage.map((item, index) => (
                                                                        <div key={`risk-coverage-${index}`} className="rounded-md bg-amber-50 p-3 text-sm">
                                                                            <p className="font-semibold text-amber-900">{item.risk || 'Risk'}</p>
                                                                            <p className="text-amber-900">{item.coverage || 'Covered by generated tests.'}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!!lastGenerationSummary.coverage_report.requirement_traceability?.length && (
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 mb-2">Requirement Traceability</p>
                                                                <div className="space-y-2">
                                                                    {lastGenerationSummary.coverage_report.requirement_traceability.slice(0, 12).map((item, index) => (
                                                                        <div key={`traceability-${index}`} className="rounded-md bg-blue-50 p-3 text-sm">
                                                                            <p className="font-semibold text-blue-900">{item.requirement_or_rule || 'Requirement / Rule'}</p>
                                                                            <p className="text-blue-900">{normalizeSummaryList(item.testcases).join(', ') || 'Generated test cases'}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {renderSummaryList('Gaps / Follow-ups', lastGenerationSummary.coverage_report.gaps_or_followups)}
                                                    </div>
                                                )}
                                                <div className="flex justify-end">
                                                    <Button onClick={() => setIsGenerationSummaryOpen(false)} className="bg-blue-600 hover:bg-blue-700">
                                                        Close
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </DialogContent>
                                </Dialog>
                            </div>
                            )}
                        </div>
                        {!developmentMode && (
                            <div className="flex space-x-2">
                                <Button
                                    onClick={handleCleanupOrphanedData}
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    <Database className="w-4 h-4 mr-2" />
                                    Cleanup Database
                                </Button>
                                <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Create Test Case
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-white border-gray-200">
                                    <DialogHeader>
                                        <DialogTitle className="text-gray-900">Create New Test Case</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Test Case Name</label>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="Enter test case name"
                                                className="bg-gray-50 border-gray-200 text-gray-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Description</label>
                                            <Textarea
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                placeholder="Enter test case description"
                                                className="bg-gray-50 border-gray-200 text-gray-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Priority</label>
                                            <select
                                                value={formData.priority}
                                                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-900"
                                            >
                                                <option value="High">High</option>
                                                <option value="Medium">Medium</option>
                                                <option value="Low">Low</option>
                                            </select>
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                                                Cancel
                                            </Button>
                                            <Button onClick={handleCreateTestCase} className="bg-gradient-to-r from-blue-500 to-indigo-500">
                                                Create TestCase
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>

                            {/* Edit Test Case Modal */}
                            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                                <DialogContent className="bg-white border-gray-200">
                                    <DialogHeader>
                                        <DialogTitle className="text-gray-900">Edit Test Case</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Test Case Name</label>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="Enter test case name"
                                                className="bg-gray-50 border-gray-200 text-gray-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Description</label>
                                            <Textarea
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                placeholder="Enter test case description"
                                                className="bg-gray-50 border-gray-200 text-gray-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-600">Priority</label>
                                            <select
                                                value={formData.priority}
                                                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-900"
                                            >
                                                <option value="High">High</option>
                                                <option value="Medium">Medium</option>
                                                <option value="Low">Low</option>
                                            </select>
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                                                Cancel
                                            </Button>
                                            <Button onClick={handleUpdateTestCase} className="bg-gradient-to-r from-blue-500 to-indigo-500">
                                                Update TestCase
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                            </div>
                        )}
                    </div>
                </CardHeader>
            </Card>

            {/* Database Info */}
            <Card className="bg-blue-500/10 backdrop-blur-sm border-blue-500/20">
                <CardContent className="p-4">
                    <div className="flex items-center space-x-2 text-blue-600">
                        <Database className="w-4 h-4" />
                        <span className="text-sm">Database: Ixigo_TestAutomation | Server: LPT2084-B1</span>
                    </div>
                </CardContent>
            </Card>

            {/* Test Cases Grid */}
            {isLoadingTestCases ? (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-spin">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Loading Test Cases...</h3>
                    <p className="text-gray-500 mb-4">
                        Fetching test cases from all suite types using optimized bulk query
                    </p>
                </div>
            ) : testCases.length === 0 ? (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <TestTube className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">No Test Cases</h3>
                    <p className="text-gray-500 mb-4">
                        {readOnlyMode 
                            ? "No test cases are available for this module."
                            : "Start by creating your first test case using the button above"
                        }
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[200px]">
                                    Test Case Name
                                </th>
                                <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[300px]">
                                    Description
                                </th>
                                <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-40">
                                    Test Case ID
                                </th>
                                <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-24">
                                    Priority
                                </th>
                                <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-24">
                                    Status
                                </th>
                                <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 w-32">
                                    Created Date
                                </th>
                                <th className="border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700 w-40">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {testCases.map((testCase) => (
                                <tr 
                                    key={testCase.id}
                                    className={`
                                        cursor-pointer transition-all duration-200 hover:bg-gray-50
                                        ${selectedTestCase?.id === testCase.id
                                            ? 'bg-blue-50 border-blue-200'
                                            : highlightTestCase === testCase.name
                                            ? 'bg-green-50 border-green-200'
                                            : 'hover:bg-gray-50'
                                        }
                                    `}
                                    onClick={() => handleTestCaseSelect(testCase)}
                                >
                                    {/* Test Case Name */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        <div className="flex items-center space-x-2">
                                            <span className="font-medium text-gray-900">{testCase.name}</span>
                                            {highlightTestCase === testCase.name && (
                                                <Badge className="bg-green-500 text-white animate-pulse text-xs">
                                                    ✨ Recently Synced
                                                </Badge>
                                            )}
                                        </div>
                                    </td>

                                    {/* Description */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        <p className="text-gray-600 text-sm">{testCase.description}</p>
                                    </td>

                                    {/* Test Case ID */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        {testCase.testcase_id && (
                                            <span className="font-mono text-xs text-blue-900 bg-blue-50 px-2 py-1 rounded">
                                                {testCase.testcase_id}
                                            </span>
                                        )}
                                    </td>

                                    {/* Priority */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        <Badge className={getPriorityColor(testCase.priority)}>
                                            {testCase.priority}
                                        </Badge>
                                    </td>

                                    {/* Status */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                                            {testCase.status}
                                        </Badge>
                                    </td>

                                    {/* Created Date */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        <span className="text-xs text-gray-600">
                                            {formatExecutionDate(testCase.created_date, { includeTime: false })}
                                        </span>
                                    </td>

                                    {/* Actions */}
                                    <td className="border border-gray-200 px-4 py-3">
                                        {!developmentMode && (
                                            <div className="flex items-center justify-center space-x-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-blue-600 hover:text-blue-800 h-8 w-8 p-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        fetchTestSteps(testCase);
                                                    }}
                                                    title="View Test Steps"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                {!readOnlyMode && (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-gray-600 hover:text-gray-900 h-8 w-8 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEditTestCase(testCase);
                                                            }}
                                                            title="Edit Test Case"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-red-600 hover:text-red-800 h-8 w-8 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteTestCase(testCase);
                                                            }}
                                                            title="Delete Test Case"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
    );
};

export default TestCaseDashboard;
