import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Filter,
  Search,
  Plus,
  Trash2,
  GripVertical,
  TestTube,
  FolderOpen,
  Package,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';
import { testSuiteService, TestSuiteType as ServiceTestSuiteType, TestCase as ServiceTestCase } from '@/services/testSuiteService';

// Icon mapping function
const getIconComponent = (iconName: string) => {
  const iconMap: { [key: string]: React.ComponentType<any> } = {
    Zap,
    Shield,
    RotateCcw,
    Settings,
  };
  return iconMap[iconName] || Settings;
};
 
// Use the service type instead of local interface
type TestSuiteType = ServiceTestSuiteType;
 
interface Project {
  id: number;
  name: string;
  description: string;
  created_date: string;
  status: string;
}
 
interface Module {
  id: number;
  module_name: string;
  description: string;
  created_at?: string;
}
 
// Use the service type instead of local interface
type TestCase = ServiceTestCase;
 
interface TestSuiteManagementProps {
  selectedSuite: TestSuiteType;
  onBack: () => void;
  initialTestCases?: TestCase[];
  onSave?: (testCases: TestCase[]) => void;
}
 
export function TestSuiteManagement({ selectedSuite, onBack, initialTestCases = [], onSave }: TestSuiteManagementProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [suiteTestCases, setSuiteTestCases] = useState<TestCase[]>(initialTestCases);
 
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
 
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draggedItem, setDraggedItem] = useState<TestCase | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);
 
  const { toast } = useToast();
 
  // Load projects on component mount
  useEffect(() => {
    loadProjects();
  }, []);
 
  // Load suite test cases from database on component mount
   useEffect(() => {
    loadSuiteTestCases();
  }, [selectedSuite.id]);
 
  const loadSuiteTestCases = async () => {
    try {
      setLoading(true);
      const testCases = await testSuiteService.getTestSuiteTestCases(selectedSuite.id);
      setSuiteTestCases(testCases);
    } catch (error) {
      console.error('Error loading suite test cases:', error);
      toast({
        title: "Error",
        description: "Failed to load suite test cases",
        variant: "destructive"
      });
      // Fallback to initial test cases if API fails
      setSuiteTestCases(initialTestCases);
    } finally {
      setLoading(false);
    }
  };
 
  // Load modules when project is selected
  useEffect(() => {
    if (selectedProject) {
      loadModules(selectedProject.id);
    } else {
      setModules([]);
      setSelectedModule(null);
    }
  }, [selectedProject]);
 
  // Load test cases when module is selected
  useEffect(() => {
    if (selectedModule) {
      loadTestCases(selectedModule.id);
      setIsSidePanelOpen(true);
    } else {
      setTestCases([]);
      setIsSidePanelOpen(false);
    }
  }, [selectedModule]);

  // Add global drop handler as fallback
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      if (draggedItem) {
        e.preventDefault();
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      if (draggedItem) {
        console.log('Global drop handler triggered');
        console.log('Drop target:', e.target);
        e.preventDefault();
        
        const target = e.target as HTMLElement;
        
        // Check if we're dropping on the Sheet backdrop
        const isSheetBackdrop = target.classList.contains('bg-black/80') || 
                               target.hasAttribute('data-state') ||
                               target.getAttribute('aria-hidden') === 'true';
        
        console.log('Is sheet backdrop:', isSheetBackdrop);
        
        if (isSheetBackdrop) {
          // If dropping on sheet backdrop, check the mouse position to see if it's over the suite area
          const suiteArea = document.getElementById('suite-configuration-area');
          if (suiteArea) {
            const rect = suiteArea.getBoundingClientRect();
            const isOverSuiteArea = e.clientX >= rect.left && e.clientX <= rect.right && 
                                   e.clientY >= rect.top && e.clientY <= rect.bottom;
            
            console.log('Mouse position:', { x: e.clientX, y: e.clientY });
            console.log('Suite area rect:', rect);
            console.log('Is over suite area:', isOverSuiteArea);
            
            if (isOverSuiteArea) {
              console.log('Dropped on suite area via position check - adding test case:', draggedItem.name);
              addTestCaseToSuite(draggedItem);
              setDraggedItem(null);
              setIsDragOverDropZone(false);
              return;
            }
          }
        }
        
        // Check if we're dropping on the suite configuration area directly
        const suiteArea = target.closest('#suite-configuration-area') || 
                         target.closest('[data-drop-zone="true"]');
        
        console.log('Suite area found:', suiteArea);
        
        if (suiteArea) {
          console.log('Dropped on suite area via global handler - adding test case:', draggedItem.name);
          addTestCaseToSuite(draggedItem);
          setDraggedItem(null);
          setIsDragOverDropZone(false);
        } else {
          console.log('No suite area found - not adding test case');
        }
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('drop', handleGlobalDrop);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [draggedItem]);
 
  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/projects'));
      if (response.ok) {
        const data = await response.json();
        setProjects(Array.isArray(data) ? data : [data]);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const loadModules = async (projectId: number) => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(`/api/modules?project_id=${projectId}`));
      if (response.ok) {
        const data = await response.json();
        setModules(data.modules || []);
      }
    } catch (error) {
      console.error('Error loading modules:', error);
      toast({
        title: "Error",
        description: "Failed to load modules",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const loadTestCases = async (moduleId: number) => {
    try {
      setLoading(true);
      const suiteTypes = ['general', 'automation', 'development', 'smoke', 'sanity', 'regression'];
      const suiteTypesParam = suiteTypes.join(',');
     
      const response = await fetch(buildApiUrl(`/api/testcases/bulk?suite_types=${encodeURIComponent(suiteTypesParam)}&module_id=${moduleId}`));
      if (response.ok) {
        const data = await response.json();
        const testCases = data.test_cases || [];
        setTestCases(testCases);
      }
    } catch (error) {
      console.error('Error loading test cases:', error);
      toast({
        title: "Error",
        description: "Failed to load test cases",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const filteredTestCases = testCases.filter(testCase => {
    const matchesSearch = testCase.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         testCase.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || testCase.priority === priorityFilter;
    const matchesStatus = statusFilter === 'all' || testCase.status === statusFilter;
    const notInSuite = !suiteTestCases.find(stc => stc.id === testCase.id);
   
    return matchesSearch && matchesPriority && matchesStatus && notInSuite;
  });
 
  const handleDragStart = (e: React.DragEvent, testCase: TestCase) => {
    console.log('Drag started for test case:', testCase.name);
    setDraggedItem(testCase);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', testCase.id.toString());
    e.dataTransfer.setData('application/json', JSON.stringify(testCase));
    
    // Create a custom drag image to make it more visible
    const dragImage = document.createElement('div');
    dragImage.textContent = testCase.name;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.background = '#3b82f6';
    dragImage.style.color = 'white';
    dragImage.style.padding = '8px 12px';
    dragImage.style.borderRadius = '6px';
    dragImage.style.fontSize = '14px';
    dragImage.style.fontWeight = '500';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    
    // Clean up the drag image after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };
 
  const handleDragOver = (e: React.DragEvent) => {
    console.log('Drag over triggered on:', e.currentTarget);
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOverDropZone(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    console.log('Drag enter triggered');
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverDropZone(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    console.log('Drag leave triggered');
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we're leaving the actual drop zone
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragOverDropZone(false);
    }
  };
 
  const handleDrop = (e: React.DragEvent) => {
    console.log('Drop event triggered on target:', e.currentTarget);
    console.log('Drop event target:', e.target);
    console.log('Dragged item:', draggedItem);
    e.preventDefault();
    e.stopPropagation();
   
    let testCaseToAdd = draggedItem;
   
    // Fallback: try to get test case from drag data
    if (!testCaseToAdd) {
      try {
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
          testCaseToAdd = JSON.parse(jsonData);
          console.log('Retrieved test case from drag data:', testCaseToAdd);
        }
      } catch (error) {
        console.error('Error parsing drag data:', error);
      }
    }
   
    if (testCaseToAdd) {
      console.log('Adding test case to suite:', testCaseToAdd.name);
      addTestCaseToSuite(testCaseToAdd);
      setDraggedItem(null);
      setDragOverIndex(null);
    } else {
      console.log('No test case to add - draggedItem:', draggedItem);
    }
    setIsDragOverDropZone(false);
  };
 
  const handleSuiteItemDragStart = (e: React.DragEvent, testCase: TestCase, index: number) => {
    setDraggedItem(testCase);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', testCase.id.toString());
  };
 
  const handleSuiteItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(index);
    e.dataTransfer.dropEffect = 'move';
  };
 
  const handleSuiteItemDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
   
    if (draggedItem) {
      const dragIndex = suiteTestCases.findIndex(tc => tc.id === draggedItem.id);
      if (dragIndex !== -1 && dragIndex !== dropIndex) {
        const newSuiteTestCases = [...suiteTestCases];
        const [removed] = newSuiteTestCases.splice(dragIndex, 1);
        newSuiteTestCases.splice(dropIndex, 0, removed);
        setSuiteTestCases(newSuiteTestCases);
       
        toast({
          title: "Test Case Reordered",
          description: `"${draggedItem.name}" moved to position ${dropIndex + 1}`,
        });
      }
    }
    setDraggedItem(null);
    setDragOverIndex(null);
  };
 
  const addTestCaseToSuite = (testCase: TestCase) => {
    console.log('addTestCaseToSuite called with:', testCase);
    console.log('Current suite test cases:', suiteTestCases);
    
    // Check if test case is already in suite
    if (suiteTestCases.find(stc => stc.id === testCase.id)) {
      console.log('Test case already in suite');
      toast({
        title: "Already Added",
        description: `"${testCase.name}" is already in this suite`,
        variant: "destructive"
      });
      return;
    }
 
    console.log('Adding test case to suite');
    setSuiteTestCases(prev => {
      const newSuite = [...prev, { ...testCase, isInSuite: true }];
      console.log('New suite test cases:', newSuite);
      return newSuite;
    });
   
    toast({
      title: "Test Case Added",
      description: `"${testCase.name}" has been added to ${selectedSuite.name}`,
    });
  };
 
  const removeTestCaseFromSuite = (testCaseId: number) => {
    setSuiteTestCases(prev => prev.filter(tc => tc.id !== testCaseId));
    toast({
      title: "Test Case Removed",
      description: "Test case has been removed from the suite",
    });
  };
 
  const saveSuiteConfiguration = async () => {
    try {
      setLoading(true);
     
       // Save to database using the service
      await testSuiteService.saveTestSuiteTestCases(selectedSuite.id, suiteTestCases);
     
      // Call the onSave callback to update parent component
      if (onSave) {
        onSave(suiteTestCases);
      }
     
      // Here you would typically save to your backend
      // For now, we'll simulate a save operation
      await new Promise(resolve => setTimeout(resolve, 1000));
     
      toast({
        title: "Suite Saved",
        description: suiteTestCases.length === 0 
           ? `${selectedSuite.name} has been saved as an empty suite`
          : `${selectedSuite.name} configuration has been saved with ${suiteTestCases.length} test cases`,
       });

     
      // Navigate back to the main suite view
      onBack();
     
    } catch (error) {
      console.error('Error saving suite:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save suite configuration",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const clearAllTestCases = () => {
    if (suiteTestCases.length === 0) return;
   
    setSuiteTestCases([]);
    toast({
      title: "Suite Cleared",
      description: "All test cases have been removed from the suite",
    });
  };
 
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
 
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'inactive': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };
 
  return (
    <div className="p-6 space-y-6">
      <PageBackButton onClick={onBack} label="Back to Suites" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
              {React.createElement(getIconComponent(selectedSuite.icon), { className: "w-8 h-8" })}
              <span>{selectedSuite.name} TestSuite Management</span>
            </h1>
            <p className="text-gray-600 mt-1">Configure test cases for this suite</p>
          </div>
        </div>
       

      </div>
 
      {/* Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Filter Projects & Modules</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Project Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Project</label>
              <Select
                value={selectedProject?.id.toString() || ''}
                onValueChange={(value) => {
                  const project = projects.find(p => p.id.toString() === value);
                  setSelectedProject(project || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      <div className="flex items-center space-x-2">
                        <FolderOpen className="w-4 h-4" />
                        <span>{project.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
 
            {/* Module Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Module</label>
              <Select
                value={selectedModule?.id.toString() || ''}
                onValueChange={(value) => {
                  const module = modules.find(m => m.id.toString() === value);
                  setSelectedModule(module || null);
                }}
                disabled={!selectedProject}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a module" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((module) => (
                    <SelectItem key={module.id} value={module.id.toString()}>
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4" />
                        <span>{module.module_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
 
      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suite Configuration */}
        <div 
          id="suite-configuration-area"
          className={cn(
            "lg:col-span-2 transition-all duration-200",
            draggedItem ? "ring-2 ring-blue-300 ring-opacity-50 rounded-lg" : ""
          )}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span>Suite Configuration</span>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  {suiteTestCases.length} Test Cases
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
            >
              {/* Drop Zone */}
              <div
                data-drop-zone="true"
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 min-h-[400px] relative",
                  draggedItem || isDragOverDropZone
                    ? "border-blue-500 bg-blue-50 shadow-lg scale-[1.02]"
                    : "border-gray-300 bg-gray-50 hover:border-gray-400"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
              >
                {/* Overlay for better drop handling when there's content */}
                {draggedItem && suiteTestCases.length > 0 && (
                  <div
                    className="absolute inset-0 z-20 bg-blue-100 bg-opacity-30 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                  >
                    <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-blue-300">
                      <p className="text-blue-600 font-medium">Drop "{draggedItem.name}" here to add to suite</p>
                    </div>
                  </div>
                )}
                {suiteTestCases.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <div className={cn(
                      "p-4 rounded-full transition-colors",
                      draggedItem ? "bg-blue-100" : "bg-gray-100"
                    )}>
                      <TestTube className={cn(
                        "w-12 h-12 mx-auto",
                        draggedItem ? "text-blue-500" : "text-gray-400"
                      )} />
                    </div>
                    <div className="space-y-2">
                      <p className={cn(
                        "text-lg font-medium",
                        draggedItem ? "text-blue-700" : "text-gray-600"
                      )}>
                        {draggedItem
                          ? "Drop test case here to add to suite"
                          : "No test cases in this suite yet"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {draggedItem
                          ? "Release to add the test case to this suite"
                          : "Select a project and module, then drag test cases here"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4" style={{ pointerEvents: 'none' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Test Cases in Suite</h3>
                      <div className="flex items-center space-x-2" style={{ pointerEvents: 'auto' }}>
                        {draggedItem && (
                          <div className="text-sm text-blue-600 font-medium animate-pulse">
                            Drop here to add "{draggedItem.name}"
                          </div>
                        )}
                        {draggedItem && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              console.log('Manual add clicked for:', draggedItem.name);
                              addTestCaseToSuite(draggedItem);
                              setDraggedItem(null);
                              setIsDragOverDropZone(false);
                            }}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add "{draggedItem.name}"
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={clearAllTestCases}
                          disabled={suiteTestCases.length === 0}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Clear All
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-[300px] overflow-y-auto" style={{ pointerEvents: 'auto' }}>
                      {suiteTestCases.map((testCase, index) => (
                        <div
                          key={testCase.id}
                          draggable
                          onDragStart={(e) => handleSuiteItemDragStart(e, testCase, index)}
                          onDragOver={(e) => handleSuiteItemDragOver(e, index)}
                          onDrop={(e) => handleSuiteItemDrop(e, index)}
                          onDragEnd={() => {
                            setDraggedItem(null);
                            setDragOverIndex(null);
                          }}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 bg-white border rounded-md shadow-sm transition-all duration-200 cursor-move",
                            draggedItem?.id === testCase.id
                              ? "opacity-50 scale-95 border-blue-300 bg-blue-50"
                              : "hover:shadow-md",
                            dragOverIndex === index && draggedItem?.id !== testCase.id
                              ? "border-green-300 bg-green-50"
                              : ""
                          )}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <span className={cn(
                                "text-xs font-medium px-2 py-1 rounded",
                                draggedItem?.id === testCase.id
                                  ? "text-blue-700 bg-blue-100"
                                  : "text-gray-500 bg-gray-100"
                              )}>
                                #{index + 1}
                              </span>
                              <GripVertical className={cn(
                                "w-4 h-4",
                                draggedItem?.id === testCase.id ? "text-blue-500" : "text-gray-400"
                              )} />
                            </div>
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(testCase.status)}
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{testCase.name}</p>
                                <p className="text-xs text-gray-500">{testCase.description}</p>
                                {draggedItem?.id === testCase.id && (
                                  <p className="text-xs text-blue-600 mt-1 font-medium">
                                    Drag to reorder within suite
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className={getPriorityColor(testCase.priority)}>
                              {testCase.priority}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeTestCaseFromSuite(testCase.id);
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={draggedItem?.id === testCase.id}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {draggedItem && (
                      <div 
                        className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg p-4 text-center cursor-pointer"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        style={{ pointerEvents: 'auto' }}
                      >
                        <p className="text-blue-600 font-medium">Drop here to add "{draggedItem.name}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
 
        {/* Side Panel Trigger */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Available Test Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <Sheet open={isSidePanelOpen} onOpenChange={setIsSidePanelOpen}>
                <SheetTrigger asChild>
                  <Button
                    className="w-full"
                    disabled={!selectedModule}
                    onClick={() => setIsSidePanelOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Browse Test Cases
                  </Button>
                </SheetTrigger>
                <SheetContent 
                  side="right" 
                  className="w-[600px] sm:w-[800px]"
                  onPointerDownOutside={(e) => {
                    // Don't close sheet when dragging
                    if (draggedItem) {
                      e.preventDefault();
                    }
                  }}
                >
                  <SheetHeader>
                    <SheetTitle>Available Test Cases</SheetTitle>
                    <SheetDescription>
                      {selectedProject && selectedModule
                        ? `${selectedProject.name} > ${selectedModule.module_name}`
                        : "Select a project and module to view test cases"
                      }
                      <br />
                      <span className="text-blue-600 font-medium">
                        💡 Drag to suite area, double-click, or use + button to add test cases
                      </span>
                    </SheetDescription>
                  </SheetHeader>
 
                  {selectedModule && (
                    <div className="space-y-4 mt-6">
                      {/* Search and Filters */}
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            placeholder="Search test cases..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                       
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Priorities</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="Low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                         
                          <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Status</SelectItem>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
 
                      <Separator />
 
                      {/* Test Cases List */}
                      <ScrollArea className="h-[600px]">
                        <div className="space-y-1">
                          {loading ? (
                            <div className="text-center py-8">
                              <p className="text-gray-500">Loading test cases...</p>
                            </div>
                          ) : filteredTestCases.length === 0 ? (
                            <div className="text-center py-8">
                              <TestTube className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                              <p className="text-gray-500">No test cases found</p>
                            </div>
                          ) : (
                            filteredTestCases.map((testCase) => (
                              <div
                                key={testCase.id}
                                draggable={true}
                                onDragStart={(e) => {
                                  console.log('Starting drag for:', testCase.name);
                                  handleDragStart(e, testCase);
                                }}
                                onDragEnd={() => {
                                  console.log('Drag ended');
                                  setDraggedItem(null);
                                }}
                                onDoubleClick={() => addTestCaseToSuite(testCase)}
                                className={cn(
                                  "px-3 py-2 border rounded-md cursor-move transition-all duration-200 select-none",
                                  draggedItem?.id === testCase.id
                                    ? "opacity-50 scale-95 border-blue-300 bg-blue-50"
                                    : "hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
                                )}
                                style={{ 
                                  userSelect: 'none',
                                  WebkitUserSelect: 'none',
                                  MozUserSelect: 'none',
                                  msUserSelect: 'none'
                                }}
                                title="Drag to suite area or double-click to add"
                              >
                                <div className="flex items-start justify-between" style={{ pointerEvents: 'none' }}>
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-1">
                                      <GripVertical className={cn(
                                        "w-4 h-4",
                                        draggedItem?.id === testCase.id ? "text-blue-500" : "text-gray-400"
                                      )} />
                                      <p className="font-medium text-gray-900 text-sm">{testCase.name}</p>
                                      {getStatusIcon(testCase.status)}
                                    </div>
                                    <p className="text-xs text-gray-600 ml-6">{testCase.description}</p>
                                    {draggedItem?.id === testCase.id && (
                                      <p className="text-xs text-blue-600 ml-6 mt-1 font-medium">
                                        Drag to suite area to add
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end space-y-1" style={{ pointerEvents: 'auto' }}>
                                    <Badge className={getPriorityColor(testCase.priority)}>
                                      {testCase.priority}
                                    </Badge>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        console.log('Plus button clicked for:', testCase.name);
                                        addTestCaseToSuite(testCase);
                                      }}
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                      disabled={draggedItem?.id === testCase.id}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
             
              {!selectedModule && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Select a project and module first
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Button at Bottom */}
      <div className="flex items-center justify-center space-x-3 pt-6 border-t border-gray-200">
        <Badge variant="outline" className="bg-blue-50 text-blue-700 px-3 py-1">
          {suiteTestCases.length} Test Cases Selected
        </Badge>
        <Button
          onClick={saveSuiteConfiguration}
          disabled={loading}
          className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 flex items-center space-x-2"
        >
          {loading ? (
            <>
              <Clock className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>Save Suite</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}