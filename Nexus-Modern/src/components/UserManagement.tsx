import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  Trash2,
  GripVertical,
  Users,
  UserCheck,
  Filter,
  X,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '../config/api';
import PageBackButton from '@/components/ui/page-back-button';

interface Function {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface Assignment {
  id: number;
  user_email: string;
  username: string;
  role: string;
  assigned_on: string;
}

interface UserManagementProps {
  selectedFunction: Function;
  onBack: () => void;
}

export function UserManagement({ selectedFunction, onBack }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<User | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // State for pending changes
  const [pendingAssignments, setPendingAssignments] = useState<User[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<Assignment[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();

  // Get current user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('qfast_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (error) {
        console.error('Error parsing saved user:', error);
      }
    }
  }, []);

  // Load data when component mounts
  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [selectedFunction.id, currentUser]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchAssignments()]);
      setError(null);
    } catch (err: any) {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (): Promise<User[]> => {
    const response = await fetch(buildApiUrl('/api/users'), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': currentUser?.email || '',
      },
    });
    const result = await response.json();
    if (response.ok) {
      setUsers(result.users.filter((user: User) => user.role !== 'Admin'));
      return result.users;
    }
    return [];
  };

  const fetchAssignments = async () => {
    const response = await fetch(buildApiUrl(`/api/function-assignments/${selectedFunction.id}`));
    const result = await response.json();
    if (response.ok) {
      setAssignments(result.assignments);
    }
  };

  // Calculate effective assignments (current + pending assignments - pending removals)
  const effectiveAssignments = [
    ...assignments.filter(assignment => !pendingRemovals.find(removal => removal.id === assignment.id)),
    ...pendingAssignments.map(user => ({
      id: -1, // Temporary ID for pending assignments
      user_email: user.email,
      username: user.username,
      role: user.role,
      assigned_on: new Date().toISOString()
    }))
  ];

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const notAssigned = !effectiveAssignments.find(assignment => assignment.user_email === user.email);
    const notPendingAssignment = !pendingAssignments.find(pending => pending.email === user.email);

    return matchesSearch && matchesRole && notAssigned && notPendingAssignment;
  });

  const handleDragStart = (e: React.DragEvent, user: User) => {
    console.log('Drag started for user:', user.username);
    setDraggedItem(user);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', user.id.toString());
    e.dataTransfer.setData('application/json', JSON.stringify(user));

    // Create a custom drag image
    const dragImage = document.createElement('div');
    dragImage.textContent = user.username;
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

    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    console.log('Drag over triggered');
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

    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;

    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragOverDropZone(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    console.log('Drop event triggered');
    e.preventDefault();
    e.stopPropagation();

    let userToAssign = draggedItem;

    if (!userToAssign) {
      try {
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
          userToAssign = JSON.parse(jsonData);
          console.log('Retrieved user from drag data:', userToAssign);
        }
      } catch (error) {
        console.error('Error parsing drag data:', error);
      }
    }

    if (userToAssign) {
      console.log('Assigning user to function:', userToAssign.username, selectedFunction.name);
      await assignUserToFunction(userToAssign);
      setDraggedItem(null);
      setIsDragOverDropZone(false);
    }
  };

  const assignUserToFunction = (user: User) => {
    // Check if user is already in pending assignments
    if (pendingAssignments.find(pending => pending.email === user.email)) {
      return;
    }

    // Check if user was in pending removals and remove from there
    setPendingRemovals(prev => prev.filter(removal => removal.user_email !== user.email));

    // Add to pending assignments
    setPendingAssignments(prev => [...prev, user]);
    setHasUnsavedChanges(true);

    toast({
      title: "User Added",
      description: `${user.username} will be assigned to ${selectedFunction.name} when you save`,
    });
  };

  const removeUserFromFunction = (assignment: Assignment) => {
    // If this is a pending assignment, remove it from pending assignments
    if (assignment.id === -1) {
      setPendingAssignments(prev => prev.filter(user => user.email !== assignment.user_email));
    } else {
      // If this is an existing assignment, add to pending removals
      // Check if it was in pending assignments and remove from there first
      setPendingAssignments(prev => prev.filter(user => user.email !== assignment.user_email));
      setPendingRemovals(prev => [...prev, assignment]);
    }
    setHasUnsavedChanges(true);

    toast({
      title: "User Removed",
      description: `${assignment.username} will be removed from ${selectedFunction.name} when you save`,
    });
  };

  const saveChanges = async () => {
    if (!hasUnsavedChanges) return;

    setSaving(true);
    try {
      // Process assignments
      for (const user of pendingAssignments) {
        const response = await fetch(buildApiUrl('/api/assign-function'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': currentUser?.email || '',
          },
          body: JSON.stringify({
            function_name: selectedFunction.id,
            user_email: user.email
          }),
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Failed to assign user');
        }
      }

      // Process removals
      for (const assignment of pendingRemovals) {
        const response = await fetch(buildApiUrl(`/api/function-assignments/${assignment.id}`), {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': currentUser?.email || '',
          },
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Failed to remove assignment');
        }
      }

      // Reset pending changes
      setPendingAssignments([]);
      setPendingRemovals([]);
      setHasUnsavedChanges(false);

      // Refresh assignments
      await fetchAssignments();

      toast({
        title: "Changes Saved",
        description: `Successfully updated user assignments for ${selectedFunction.name}`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageBackButton onClick={onBack} label="Back to Functions" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
              <div className={`flex-shrink-0 h-8 w-8 rounded-lg ${selectedFunction.color} flex items-center justify-center`}>
                <span className="text-white font-bold text-sm">{selectedFunction.icon.charAt(0)}</span>
              </div>
              <span>{selectedFunction.name} - User Management</span>
            </h1>
            <p className="text-gray-600 mt-1">{selectedFunction.description}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Search & Filter Users</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Developer">Developer</SelectItem>
                <SelectItem value="Tester">Tester</SelectItem>
                <SelectItem value="User">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>Available Users</span>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                {filteredUsers.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No users found</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {users.length === 0 ? 'No users available' : 'All users are already assigned'}
                    </p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, user)}
                      onDragEnd={() => setDraggedItem(null)}
                      className={cn(
                        "px-3 py-2 border rounded-md cursor-move transition-all duration-200 select-none",
                        draggedItem?.id === user.id
                          ? "opacity-50 scale-95 border-blue-300 bg-blue-50"
                          : "hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
                      )}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                      title="Drag to assign to function"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <GripVertical className="w-4 h-4 text-gray-400" />
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-700">
                                {user.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{user.username}</p>
                            <p className="text-xs text-gray-600">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className="text-xs">{user.role}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => assignUserToFunction(user)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
          </CardContent>
        </Card>

        {/* Assigned Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <UserCheck className="w-5 h-5" />
              <span>Assigned Users</span>
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                {effectiveAssignments.length}
              </Badge>
              {hasUnsavedChanges && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 animate-pulse">
                  Unsaved Changes
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "min-h-[500px] transition-all duration-200",
              draggedItem ? "ring-2 ring-blue-300 ring-opacity-50 rounded-lg" : ""
            )}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          >
            {/* Drop Zone */}
            <div
              data-drop-zone="true"
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 min-h-[450px] relative",
                draggedItem || isDragOverDropZone
                  ? "border-blue-500 bg-blue-50 shadow-lg scale-[1.02]"
                  : "border-gray-300 bg-gray-50 hover:border-gray-400"
              )}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
            >
              {/* Overlay for better drop handling */}
              {draggedItem && assignments.length > 0 && (
                <div
                  className="absolute inset-0 z-20 bg-blue-100 bg-opacity-30 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                >
                  <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-blue-300">
                    <p className="text-blue-600 font-medium">Drop "{draggedItem.username}" here to assign</p>
                  </div>
                </div>
              )}

              {assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <div className={cn(
                    "p-4 rounded-full transition-colors",
                    draggedItem ? "bg-blue-100" : "bg-gray-100"
                  )}>
                    <UserCheck className={cn(
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
                        ? "Drop user here to assign"
                        : "No users assigned yet"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {draggedItem
                        ? "Release to assign the user to this function"
                        : "Drag users from the left panel or use the + button"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Assigned Users</h3>
                    {draggedItem && (
                      <div className="text-sm text-blue-600 font-medium animate-pulse">
                        Drop here to assign "{draggedItem.username}"
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 max-h-[380px] overflow-y-auto">
                    {effectiveAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between px-3 py-2 bg-white border rounded-md shadow-sm"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-700">
                                {assignment.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{assignment.username}</p>
                            <p className="text-xs text-gray-600">{assignment.user_email}</p>
                            <p className="text-xs text-gray-500">{assignment.role}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeUserFromFunction(assignment)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      {hasUnsavedChanges && (
        <div className="flex items-center justify-center space-x-4 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            You have unsaved changes ({pendingAssignments.length} additions, {pendingRemovals.length} removals)
          </div>
          <Button
            onClick={saveChanges}
            disabled={saving}
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">How to use</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>Drag users from the "Available Users" section to the "Assigned Users" area, or use the search and filter options.</p>
              <p className="mt-1">Click the X button next to assigned users to remove their access.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}