import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Edit3, Save, X, Package, Layers, FolderOpen, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';

interface Module {
  id: number;
  module_name: string;
  description: string;
  created_at?: string;
}

interface ModulesDashboardProps {
  selectedProject: any;
  onNext?: () => void;
  onBack?: () => void;
  onModuleSelect?: (module: Module) => void;
  readOnlyMode?: boolean;
}

const ModulesDashboard: React.FC<ModulesDashboardProps> = ({ 
  selectedProject, 
  onNext, 
  onBack,
  onModuleSelect,
  readOnlyMode = false
}) => {
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    module_name: '',
    description: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    if (selectedProject) {
      fetchModules();
    }
  }, [selectedProject]);

  const fetchModules = async () => {
    if (!selectedProject) return;
    
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl(`/api/modules?project_id=${selectedProject.id}`));
      if (response.ok) {
        const data = await response.json();
        setModules(data.modules || []);
      } else {
        throw new Error('Failed to fetch modules');
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
      toast({
        title: "Error",
        description: "Failed to fetch modules",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateModule = async () => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Module creation is not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.module_name.trim()) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please enter a module name",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(buildApiUrl('/api/modules'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.module_name,
          description: formData.description,
          project_id: selectedProject.id
        }),
      });

      if (response.ok) {
        const newModule = await response.json();
        console.log('✅ Module created successfully:', newModule);
        
        setIsCreateDialogOpen(false);
        setFormData({ module_name: '', description: '' });
        await fetchModules(); // Reload modules list
        
        toast({
          title: "✅ Module Created",
          description: `Module "${formData.module_name}" has been created successfully`,
        });
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to create module:', errorData);
        throw new Error(errorData.error || `Failed to create module: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error creating module:', error);
      toast({
        title: "❌ Creation Failed",
        description: error.message || "Failed to create module. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleUpdateModule = async (module: Module) => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Module updates are not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      setEditingModule(null);
      return;
    }

    if (!editingModule) {
      setEditingModule(null);
      return;
    }

    if (!editingModule.module_name.trim()) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please enter a module name",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/modules/${editingModule.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingModule.module_name,
          description: editingModule.description
        }),
      });

      if (response.ok) {
        const updatedModule = await response.json();
        console.log('✅ Module updated successfully:', updatedModule);
        
        setEditingModule(null);
        await fetchModules(); // Reload modules list
        
        toast({
          title: "✅ Module Updated",
          description: `Module "${editingModule.module_name}" has been updated successfully`,
        });
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to update module:', errorData);
        throw new Error(errorData.error || `Failed to update module: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error updating module:', error);
      toast({
        title: "❌ Update Failed",
        description: error.message || "Failed to update module. Please try again.",
        variant: "destructive"
      });
    }
    setEditingModule(null);
  };

  const handleDeleteModule = async (moduleId: number) => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Module deletion is not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      return;
    }

    if (!window.confirm('⚠️ CASCADE DELETE WARNING\n\nDeleting this module will automatically delete:\n• All test suites in this module\n• All test cases related to this module\n• All test steps for those test cases\n\n📊 REPORTS WILL BE PRESERVED\n• Execution results and reports will be kept for historical reference\n\nThis action cannot be undone. Are you sure you want to proceed?')) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/modules/${moduleId}`), {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Module deleted successfully:', result);
        await fetchModules(); // Reload modules list
        
        // Clear selection if deleted module was selected
        if (selectedModule?.id === moduleId) {
          setSelectedModule(null);
        }
        
        // Show detailed deletion summary
        const summary = result.deletion_summary;
        const summaryText = summary ? 
          `Module "${summary.module_name}" processed:\n• Test Suites: ${summary.test_suites_deleted} deleted\n• Test Cases: ${summary.test_cases_deleted} deleted\n• Test Steps Tables: ${summary.test_steps_tables_deleted} deleted\n• Reports: ${summary.execution_results_preserved || 0} preserved` :
          "Module and related data have been processed successfully";
        
        toast({
          title: "✅ Cascade Deletion Complete",
          description: summaryText,
        });
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to delete module:', errorData);
        throw new Error(errorData.error || `Failed to delete module: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error deleting module:', error);
      toast({
        title: "❌ Deletion Failed",
        description: error.message || "Failed to delete module. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleModuleSelect = (module: Module) => {
    setSelectedModule(module);
    onModuleSelect(module);
  };

  const handleNext = () => {
    if (!selectedModule) {
      toast({
        title: "Selection Required",
        description: "Please select a module to proceed",
        variant: "destructive"
      });
      return;
    }
    onNext();
  };

  if (!selectedProject) {
    return (
      <div className="text-center py-8">
        <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Please select a project first</p>
      </div>
    );
  }

  return (
    <div className="modules-dashboard-theme space-y-6">
      <PageBackButton onClick={onBack} label="Back to Projects" />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
            <Layers className="text-blue-500" />
            <span>Modules Management</span>
          </h2>
          <p className="text-gray-600 mt-1">
            Project: <span className="font-medium text-blue-600">{selectedProject.project_name || selectedProject.name}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {!readOnlyMode && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                <Plus className="w-4 h-4 mr-2" />
                Create Module
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Module</DialogTitle>
                <DialogDescription>
                  Add a new module to organize your test cases
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="module_name">Module Name</Label>
                  <Input
                    id="module_name"
                    value={formData.module_name}
                    onChange={(e) => setFormData({ ...formData, module_name: e.target.value })}
                    placeholder="Enter module name"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter module description"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateModule}>
                    Create Module
                  </Button>
                </div>
              </div>
            </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <p>Loading modules...</p>
        </div>
      ) : modules.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No modules found</p>
            <p className="text-sm text-gray-500">Create your first module to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Card 
              key={module.id} 
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                selectedModule?.id === module.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:border-blue-300'
              }`}
              onClick={() => handleModuleSelect(module)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Package className="w-5 h-5 text-blue-500" />
                    {editingModule?.id === module.id && !readOnlyMode ? (
                      <Input
                        value={editingModule.module_name}
                        onChange={(e) => setEditingModule({ ...editingModule, module_name: e.target.value })}
                        className="text-lg font-semibold"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span>{module.module_name}</span>
                    )}
                  </CardTitle>
                  {!readOnlyMode && (
                    <div className="flex space-x-1">
                      {editingModule?.id === module.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateModule(editingModule);
                            }}
                          >
                            <Save className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingModule(null);
                            }}
                          >
                            <X className="w-4 h-4 text-gray-600" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingModule(module);
                            }}
                          >
                            <Edit3 className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteModule(module.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingModule?.id === module.id && !readOnlyMode ? (
                  <Textarea
                    value={editingModule.description}
                    onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })}
                    placeholder="Module description"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p className="text-gray-600 text-sm">
                    {module.description || 'No description available'}
                  </p>
                )}
                {selectedModule?.id === module.id && (
                  <div className="mt-3 p-2 bg-blue-100 rounded-lg">
                    <p className="text-blue-700 text-sm font-medium">✓ Selected</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-6">
        <Button 
          onClick={handleNext}
          disabled={!selectedModule}
          className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
        >
          Next: Test Cases →
        </Button>
      </div>
    </div>
  );
};

export default ModulesDashboard;

