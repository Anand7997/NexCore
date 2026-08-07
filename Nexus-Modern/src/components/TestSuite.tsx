import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Eye,
  Edit,
  Trash2,
  Zap,
  Shield,
  RotateCcw,
  ArrowLeft,
  Settings,
  Calendar,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PageBackButton from '@/components/ui/page-back-button';
import { TestSuiteManagement } from './TestSuiteManagement';
import { testSuiteService, TestSuiteType, TestCase } from '@/services/testSuiteService';
import { useToast } from '@/hooks/use-toast';
 
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
 
// Remove the local interface since we're importing it from the service
// Remove initialTestSuites since we'll load from the database
 
interface TestSuiteProps {
  onBack?: () => void;
}
 
export function TestSuite({ onBack }: TestSuiteProps) {
  // State management using database instead of localStorage
  const [testSuites, setTestSuites] = useState<TestSuiteType[]>([]);
  const [selectedSuite, setSelectedSuite] = useState<TestSuiteType | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showManagement, setShowManagement] = useState(false);
  const [managementSuite, setManagementSuite] = useState<TestSuiteType | null>(null);
  const [suiteTestCases, setSuiteTestCases] = useState<{[key: string]: TestCase[]}>({});
  const [loading, setLoading] = useState(false);
  const [newSuite, setNewSuite] = useState({
    name: '',
    description: '',
    testCount: 0,
  });
 
  const { toast } = useToast();
 
  // Load test suites from database on component mount
  useEffect(() => {
    initializeAndLoadTestSuites();
  }, []);
 
  const initializeAndLoadTestSuites = async () => {
    try {
      setLoading(true);
      // First initialize default suites if they don't exist
      await testSuiteService.initializeDefaultSuites();
      // Then load all suites
      await loadTestSuites();
    } catch (error) {
      console.error('Error initializing and loading test suites:', error);
      toast({
        title: "Error",
        description: "Failed to initialize test suites",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const loadTestSuites = async () => {
    try {
      const suites = await testSuiteService.getAllTestSuites();
      setTestSuites(suites);
      console.log('Loaded test suites from database:', suites);
    } catch (error) {
      console.error('Error loading test suites:', error);
      toast({
        title: "Error",
        description: "Failed to load test suites",
        variant: "destructive"
      });
      throw error; // Re-throw to be handled by caller
    }
  };
 
  const loadSuiteTestCases = async (suiteId: string) => {
    try {
      const testCases = await testSuiteService.getTestSuiteTestCases(suiteId);
      setSuiteTestCases(prev => ({
        ...prev,
        [suiteId]: testCases
      }));
      return testCases;
    } catch (error) {
      console.error('Error loading suite test cases:', error);
      toast({
        title: "Error",
        description: "Failed to load test cases for suite",
        variant: "destructive"
      });
      return [];
    }
  };
 
  const handleCreateSuite = async () => {
    if (!newSuite.name.trim()) return;
 
    try {
      setLoading(true);
      const newSuiteData = {
        name: newSuite.name,
        description: newSuite.description,
        icon: 'Settings', // Default icon for new suites
        gradient: 'from-gray-500 to-slate-500', // Default gradient
        testCount: newSuite.testCount,
        lastRun: 'Never',
        status: 'active' as const,
      };
 
      console.log('Creating new suite:', newSuiteData);
      const suiteId = await testSuiteService.createTestSuite(newSuiteData);
     
      // Reload test suites to get the updated list
      await loadTestSuites();
     
      setNewSuite({ name: '', description: '', testCount: 0 });
      setIsCreateDialogOpen(false);
     
      toast({
        title: "Success",
        description: "Test suite created successfully",
      });
    } catch (error) {
      console.error('Error creating test suite:', error);
      toast({
        title: "Error",
        description: "Failed to create test suite",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const handleEditSuite = async () => {
    if (!selectedSuite) return;
 
    // Get the form values
    const nameInput = document.getElementById('edit-suite-name') as HTMLInputElement;
    const descriptionInput = document.getElementById('edit-suite-description') as HTMLTextAreaElement;
    const testCountInput = document.getElementById('edit-test-count') as HTMLInputElement;
 
    if (!nameInput?.value.trim()) return;
 
    try {
      setLoading(true);
      const updatedData = {
        name: nameInput.value,
        description: descriptionInput.value,
        testCount: parseInt(testCountInput.value) || 0,
      };
 
      await testSuiteService.updateTestSuite(selectedSuite.id, updatedData);
     
      // Reload test suites to get the updated list
      await loadTestSuites();
 
      setIsEditDialogOpen(false);
      setSelectedSuite(null);
     
      toast({
        title: "Success",
        description: "Test suite updated successfully",
      });
    } catch (error) {
      console.error('Error updating test suite:', error);
      toast({
        title: "Error",
        description: "Failed to update test suite",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const handleDeleteSuite = async (suiteId: string) => {
    try {
      setLoading(true);
     
      // If the deleted suite is currently being managed, close the management view FIRST
      if (managementSuite && managementSuite.id === suiteId) {
        setShowManagement(false);
        setManagementSuite(null);
      }
 
      await testSuiteService.deleteTestSuite(suiteId);
     
      // Reload test suites to get the updated list
      await loadTestSuites();
     
      // Clean up the suite test cases from local state
      setSuiteTestCases(prev => {
        const updated = { ...prev };
        delete updated[suiteId];
        return updated;
      });
     
      toast({
        title: "Success",
        description: "Test suite deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting test suite:', error);
      toast({
        title: "Error",
        description: "Failed to delete test suite",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  const openCreateDialog = () => {
    setIsCreateDialogOpen(true);
  };
 
  const openEditDialog = (suite: TestSuiteType) => {
    setSelectedSuite(suite);
    setIsEditDialogOpen(true);
  };
 
  const openSuiteManagement = async (suite: TestSuiteType) => {
    setManagementSuite(suite);
   
    // Load test cases for this suite if not already loaded
    if (!suiteTestCases[suite.id]) {
      await loadSuiteTestCases(suite.id);
    }
   
    setShowManagement(true);
  };
 
  const closeSuiteManagement = () => {
    setShowManagement(false);
    setManagementSuite(null);
  };
 
  const handleSuiteSave = async (suiteId: string, testCases: TestCase[]) => {
    try {
      setLoading(true);
     
      // Save test cases to database
      await testSuiteService.saveTestSuiteTestCases(suiteId, testCases);
     
      // Update local state
      setSuiteTestCases(prev => ({
        ...prev,
        [suiteId]: testCases
      }));
     
      // Reload test suites to get updated test count
      await loadTestSuites();
     
      toast({
        title: "Success",
        description: "Test cases saved successfully",
      });
    } catch (error) {
      console.error('Error saving test cases:', error);
      toast({
        title: "Error",
        description: "Failed to save test cases",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
 
  // Debug function to reload test suites (for development)
  const reloadTestSuites = async () => {
    await initializeAndLoadTestSuites();
    toast({
      title: "Success",
      description: "Test suites reloaded",
    });
  };
 
  // Show management page if a suite is selected for management
  if (showManagement && managementSuite) {
    return (
      <TestSuiteManagement
        selectedSuite={managementSuite}
        onBack={closeSuiteManagement}
        initialTestCases={suiteTestCases[managementSuite.id] || []}
        onSave={(testCases) => handleSuiteSave(managementSuite.id, testCases)}
      />
    );
  }
 
  return (
    <div className="p-6 space-y-6">
      <PageBackButton onClick={onBack} label="Back" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Test Suite</h1>
            <p className="text-gray-600 mt-1">Manage your test suites</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={openCreateDialog}
            disabled={loading}
            className="flex items-center space-x-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Create New Suite</span>
          </Button>
          {/* Debug button for development */}
          <Button
            variant="outline"
            onClick={reloadTestSuites}
            disabled={loading}
            className="text-blue-600 hover:text-blue-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reload"}
          </Button>
        </div>
      </div>
 
      {/* Test Suite Tiles */}
      {loading && testSuites.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-gray-600">Loading test suites...</span>
          </div>
        </div>
      ) : testSuites.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No test suites found</h3>
            <p className="text-gray-600 mb-4">Create your first test suite to get started</p>
            <Button onClick={openCreateDialog} className="flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create New Suite</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testSuites.map((suite) => (
          <Card
            key={suite.id}
            className="cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border-gray-200 bg-white hover:bg-gray-50"
            onClick={() => openSuiteManagement(suite)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={cn("p-2 rounded-lg bg-gradient-to-r", suite.gradient)}>
                    {React.createElement(getIconComponent(suite.icon), { className: "w-5 h-5 text-white" })}
                  </div>
                  <div>
                    <CardTitle className="text-lg text-gray-900">{suite.name}</CardTitle>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-gray-900"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog(suite);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {!testSuiteService.isDefaultSuite(suite.name) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Test Suite</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{suite.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSuite(suite.id);
                            }}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-4">{suite.description}</p>
              <div className="space-y-2">
                <div className="flex items-center text-xs text-gray-600">
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Test Cases: {suite.testCount}</span>
                </div>
                <div className="flex items-center text-xs text-gray-600">
                  <Calendar className="w-3 h-3 mr-1" />
                  <span>Last Run: {suite.lastRun}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className={cn(
                    suite.status === 'active'
                      ? 'bg-green-500/20 text-green-600'
                      : 'bg-gray-500/20 text-gray-600'
                  )}>
                    {suite.status}
                  </Badge>
                  {testSuiteService.isDefaultSuite(suite.name) && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                      Default
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          ))}
        </div>
      )}
 
      {/* Create Suite Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Test Suite</DialogTitle>
            <DialogDescription>
              Create a new test suite
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="suite-name">Suite Name</Label>
              <Input
                id="suite-name"
                value={newSuite.name}
                onChange={(e) => setNewSuite(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter suite name"
              />
            </div>
            <div>
              <Label htmlFor="suite-description">Description</Label>
              <Textarea
                id="suite-description"
                value={newSuite.description}
                onChange={(e) => setNewSuite(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter suite description"
              />
            </div>
            <div>
              <Label htmlFor="test-count">Initial Test Count</Label>
              <Input
                id="test-count"
                type="number"
                value={newSuite.testCount}
                onChange={(e) => setNewSuite(prev => ({ ...prev, testCount: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreateSuite} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Suite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
 
      {/* Edit Suite Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Test Suite</DialogTitle>
            <DialogDescription>
              Update the test suite details
            </DialogDescription>
          </DialogHeader>
          {selectedSuite && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-suite-name">Suite Name</Label>
                <Input
                  id="edit-suite-name"
                  defaultValue={selectedSuite.name}
                  placeholder="Enter suite name"
                />
              </div>
              <div>
                <Label htmlFor="edit-suite-description">Description</Label>
                <Textarea
                  id="edit-suite-description"
                  defaultValue={selectedSuite.description}
                  placeholder="Enter suite description"
                />
              </div>
              <div>
                <Label htmlFor="edit-test-count">Test Count</Label>
                <Input
                  id="edit-test-count"
                  type="number"
                  defaultValue={selectedSuite.testCount}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleEditSuite} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Update Suite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}