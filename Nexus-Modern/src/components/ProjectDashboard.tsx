import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, FolderOpen, Calendar, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import PageBackButton from '@/components/ui/page-back-button';

interface Project {
  id: number;
  name: string;
  description: string;
  created_date: string;
  created_by?: string;
  status: string;
}

interface ProjectDashboardProps {
  onProjectSelect?: (project: Project) => void;
  onNext?: () => void;
  onBack?: () => void;
  showBackButton?: boolean;
  readOnlyMode?: boolean;
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ 
  onProjectSelect, 
  onNext, 
  onBack,
  showBackButton = true,
  readOnlyMode = false 
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const { toast } = useToast();

  // Debug: Log projects state changes
  useEffect(() => {
    console.log('🔍 Projects state changed:', projects);
    console.log('🔍 Projects length:', projects.length);
  }, [projects]);

  const loadProjects = async () => {
    try {
      console.log('🔄 Loading projects...');
      const response = await fetch(buildApiUrl('/api/projects'));
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Loaded projects:', data);
        console.log('✅ Projects count:', data.length);
        console.log('✅ Projects type:', typeof data);
        setProjects(Array.isArray(data) ? data : [data]);
      } else {
        console.error('❌ Failed to load projects, status:', response.status);
        setProjects([]);
      }
    } catch (error) {
      console.error('❌ Error loading projects:', error);
      setProjects([]);
    }
  };

  useEffect(() => {
    loadProjects();
    
    // Auto-refresh every minute
    const interval = setInterval(loadProjects, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProject = async () => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Project creation is not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please enter a project name",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(buildApiUrl('/api/projects'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          status: 'Active'
        }),
      });

      if (response.ok) {
        const newProject = await response.json();
        console.log('✅ Project created successfully:', newProject);
        
        setIsCreateModalOpen(false);
        setFormData({ name: '', description: '' });
        await loadProjects(); // Reload projects list
        
        toast({
          title: "✅ Project Created",
          description: `Project "${formData.name}" has been created successfully`,
        });
      } else {
        const errorData = await response.text();
        console.error('❌ Failed to create project:', errorData);
        throw new Error(`Failed to create project: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error creating project:', error);
      toast({
        title: "❌ Creation Failed",
        description: "Failed to create project. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleEditProject = (project: Project) => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Project editing is not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      return;
    }

    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateProject = async () => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Project updates are not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      return;
    }

    if (!editingProject) {
      toast({
        title: "⚠️ Error",
        description: "No project selected for editing",
        variant: "destructive"
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please enter a project name",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/projects/${editingProject.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description
        }),
      });

      if (response.ok) {
        const updatedProject = await response.json();
        console.log('✅ Project updated successfully:', updatedProject);
        
        setIsEditModalOpen(false);
        setEditingProject(null);
        setFormData({ name: '', description: '' });
        await loadProjects(); // Reload projects list
        
        toast({
          title: "✅ Project Updated",
          description: `Project "${formData.name}" has been updated successfully`,
        });
      } else {
        const errorData = await response.text();
        console.error('❌ Failed to update project:', errorData);
        throw new Error(`Failed to update project: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error updating project:', error);
      toast({
        title: "❌ Update Failed",
        description: "Failed to update project. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (readOnlyMode) {
      toast({
        title: "Feature Disabled",
        description: "Project deletion is not available in automation development. Please use the planning phase.",
        variant: "destructive"
      });
      return;
    }

    if (!window.confirm('⚠️ CASCADE DELETE WARNING\n\nDeleting this project will automatically delete:\n• All modules in this project\n• All test suites in those modules\n• All test cases in this project\n• All test steps for those test cases\n\n📊 REPORTS WILL BE PRESERVED\n• Execution results and reports will be kept for historical reference\n\nThis action cannot be undone. Are you sure you want to proceed?')) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/projects/${projectId}`), {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Project deleted successfully:', result);
        await loadProjects(); // Reload projects list
        
        // Show detailed deletion summary
        const summary = result.deletion_summary;
        const summaryText = summary ? 
          `Project "${summary.project_name}" processed:\n• Modules: ${summary.modules_deleted} deleted\n• Test Suites: ${summary.test_suites_deleted} deleted\n• Test Cases: ${summary.test_cases_deleted} deleted\n• Test Steps Tables: ${summary.test_steps_tables_deleted} deleted\n• Reports: ${summary.execution_results_preserved || 0} preserved` :
          "Project and related data have been processed successfully";
        
        toast({
          title: "✅ Cascade Deletion Complete",
          description: summaryText,
        });
      } else {
        const errorData = await response.text();
        console.error('❌ Failed to delete project:', errorData);
        throw new Error(`Failed to delete project: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      toast({
        title: "❌ Deletion Failed",
        description: "Failed to delete project. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    onProjectSelect?.(project);
  };

  const handleProceed = () => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project to proceed",
        variant: "destructive"
      });
      return;
    }
    onNext?.();
  };

  return (
    <div className="project-dashboard-theme space-y-6">
      <PageBackButton onClick={showBackButton ? onBack : undefined} label="Back" />

      {/* Header Section */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-gray-900 flex items-center space-x-2">
                <FolderOpen className="w-6 h-6 text-blue-600" />
                <span>Project Management</span>
              </CardTitle>
              <p className="text-gray-600 mt-2">Create and manage your test automation projects</p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
              {!readOnlyMode && (
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent className="bg-white border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-gray-900">Create New Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Project Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter project name"
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Description</label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter project description"
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateProject} className="bg-gradient-to-r from-blue-500 to-indigo-500">
                      Create Project
                    </Button>
                  </div>
                </div>
              </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Edit Project Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Project Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter project name"
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter project description"
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateProject} className="bg-gradient-to-r from-green-500 to-emerald-500">
                Update Project
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-600 text-lg">No projects found. Loading...</p>
            <p className="text-gray-500 text-sm mt-2">If this persists, check the console for errors.</p>
          </div>
        )}
        {projects.map((project) => (
          <Card 
            key={project.id} 
            className={`
              cursor-pointer transition-all duration-200 hover:scale-105
              ${selectedProject?.id === project.id 
                ? 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border-blue-400 dark:from-blue-950/60 dark:to-slate-800 dark:border-blue-700' 
                : 'bg-white hover:bg-gray-50 border-gray-200 dark:bg-card dark:hover:bg-accent dark:border-border'
              }
              backdrop-blur-sm
            `}
            onClick={() => handleProjectSelect(project)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-gray-900">{project.name}</CardTitle>
                {!readOnlyMode && (
                  <div className="flex space-x-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-gray-600 hover:text-gray-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditProject(project);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-600 hover:text-red-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-4">{project.description}</p>
              <div className="space-y-2">
                <div className="flex items-center text-xs text-gray-600">
                  <Calendar className="w-3 h-3 mr-1" />
                  <span>Created: {formatExecutionDate(project.created_date, { includeTime: false })}</span>
                </div>
                <div className="flex items-center text-xs text-gray-600">
                  <User className="w-3 h-3 mr-1" />
                  <span>By: {project.created_by || 'System'}</span>
                </div>
                <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                  {project.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      

      {/* Proceed Button */}
      {selectedProject && onNext && (
        <div className="flex justify-center">
          <Card className="bg-white backdrop-blur-sm border-gray-200 p-4 dark:bg-card dark:border-border">
            <div className="flex items-center space-x-4">
              <div className="text-gray-900">
                <p className="font-medium">Selected Project: {selectedProject.name}</p>
                <p className="text-sm text-gray-600">Ready to create modules</p>
              </div>
              <Button 
                onClick={handleProceed}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                Proceed to Modules
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

export default ProjectDashboard;
