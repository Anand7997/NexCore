import React, { useState, useEffect } from 'react';
import { buildApiUrl } from '../config/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, UserCheck, UserX, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: number;
  username: string;
  email: string;
  status: string;
  role: string | null;
  created_at: string | null;
  last_login: string | null;
}

interface CurrentUser {
  id: number;
  username: string;
  email: string;
  role?: string;
  last_login: string;
}

interface AuthorizeUsersProps {
  currentUser: CurrentUser;
}

const AuthorizeUsers: React.FC<AuthorizeUsersProps> = ({ currentUser }) => {
   const [users, setUsers] = useState<User[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [processingUser, setProcessingUser] = useState<number | null>(null);
   const [showRoleModal, setShowRoleModal] = useState(false);
   const [selectedUserForApproval, setSelectedUserForApproval] = useState<User | null>(null);
   const [selectedRole, setSelectedRole] = useState<'User' | 'Admin'>('User');

   // CRUD state
   const [showCreateModal, setShowCreateModal] = useState(false);
   const [showEditModal, setShowEditModal] = useState(false);
   const [editingUser, setEditingUser] = useState<User | null>(null);
   const [newUser, setNewUser] = useState({
     username: '',
     email: '',
     role: 'User' as 'User' | 'Admin',
     status: 'Approved' as 'Pending' | 'Approved' | 'Rejected'
   });
   const [editUser, setEditUser] = useState({
     username: '',
     email: '',
     role: 'User' as 'User' | 'Admin',
     status: 'Approved' as 'Pending' | 'Approved' | 'Rejected'
   });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/users'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': currentUser.email,
        },
      });
      const result = await response.json();
      if (response.ok) {
        setUsers(result.users);
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch users');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openRoleModal = (user: User) => {
    setSelectedUserForApproval(user);
    setSelectedRole('User'); // Default to User
    setShowRoleModal(true);
  };

  const closeRoleModal = () => {
    setShowRoleModal(false);
    setSelectedUserForApproval(null);
    setSelectedRole('User');
  };

  const handleApproveUser = async () => {
    if (!selectedUserForApproval) return;

    try {
      setProcessingUser(selectedUserForApproval.id);
      const response = await fetch(buildApiUrl('/api/users/approve'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': currentUser.email,
        },
        body: JSON.stringify({ user_id: selectedUserForApproval.id, role: selectedRole }),
      });
      const result = await response.json();
      if (response.ok) {
        await fetchUsers(); // Refresh the list
        closeRoleModal();
      } else {
        setError(result.error || 'Failed to approve user');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleRejectUser = async (userId: number) => {
     try {
       setProcessingUser(userId);
       const response = await fetch(buildApiUrl('/api/users/reject'), {
         method: 'PUT',
         headers: {
           'Content-Type': 'application/json',
           'X-User-Email': currentUser.email,
         },
         body: JSON.stringify({ user_id: userId }),
       });
       const result = await response.json();
       if (response.ok) {
         await fetchUsers(); // Refresh the list
       } else {
         setError(result.error || 'Failed to reject user');
       }
     } catch (err: any) {
       setError('Network error. Please try again.');
     } finally {
       setProcessingUser(null);
     }
   };

  // CRUD Operations
  const handleCreateUser = async () => {
    if (!newUser.username.trim() || !newUser.email.trim()) {
      setError('Username and email are required');
      return;
    }

    try {
      setProcessingUser(-1); // Use -1 to indicate creating
      const response = await fetch(buildApiUrl('/api/users'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': currentUser.email,
        },
        body: JSON.stringify(newUser),
      });
      const result = await response.json();
      if (response.ok) {
        await fetchUsers(); // Refresh the list
        setShowCreateModal(false);
        setNewUser({ username: '', email: '', role: 'User', status: 'Approved' });
        setError(null);
      } else {
        setError(result.error || 'Failed to create user');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditUser({
      username: user.username,
      email: user.email,
      role: (user.role as 'User' | 'Admin') || 'User',
      status: (user.status as 'Pending' | 'Approved' | 'Rejected') || 'Approved'
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser || !editUser.username.trim() || !editUser.email.trim()) {
      setError('Username and email are required');
      return;
    }

    try {
      setProcessingUser(editingUser.id);
      const response = await fetch(buildApiUrl(`/api/users/${editingUser.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': currentUser.email,
        },
        body: JSON.stringify(editUser),
      });
      const result = await response.json();
      if (response.ok) {
        await fetchUsers(); // Refresh the list
        setShowEditModal(false);
        setEditingUser(null);
        setError(null);
      } else {
        setError(result.error || 'Failed to update user');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      setProcessingUser(userId);
      const response = await fetch(buildApiUrl(`/api/users/${userId}`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': currentUser.email,
        },
      });
      const result = await response.json();
      if (response.ok) {
        await fetchUsers(); // Refresh the list
        setError(null);
      } else {
        setError(result.error || 'Failed to delete user');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setProcessingUser(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800'
    };
    return statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800';
  };

  const getRoleBadge = (role: string | null) => {
    if (!role) return null;
    const roleClasses = {
      'Admin': 'bg-purple-100 text-purple-800',
      'User': 'bg-blue-100 text-blue-800'
    };
    return roleClasses[role as keyof typeof roleClasses] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">User Authorization</h1>
        <p className="mt-2 text-gray-600">Manage user approvals and role assignments</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
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

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
         <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
           <div className="flex justify-between items-center">
             <div>
               <h3 className="text-lg leading-6 font-medium text-gray-900">All Users</h3>
               <p className="mt-1 text-sm text-gray-500">Review and manage user access</p>
             </div>
             <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700">
               <Plus className="w-4 h-4 mr-2" />
               Add User
             </Button>
           </div>
         </div>

        <ul className="divide-y divide-gray-200">
          {users.map((user) => (
            <li key={user.id} className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.username}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex flex-col items-end space-y-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(user.status)}`}>
                      {user.status}
                    </span>
                    {user.role && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    {user.status === 'Pending' && (
                      <>
                        <button
                          onClick={() => openRoleModal(user)}
                          disabled={processingUser === user.id}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                        >
                          {processingUser === user.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleRejectUser(user.id)}
                          disabled={processingUser === user.id}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                        >
                          {processingUser === user.id ? 'Processing...' : 'Reject'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEditUser(user)}
                      disabled={processingUser === user.id}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={processingUser === user.id}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-2 text-sm text-gray-500">
                <div className="flex space-x-4">
                  <span>Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
                  {user.last_login && (
                    <span>Last Login: {new Date(user.last_login).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {users.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
            <p className="mt-1 text-sm text-gray-500">No users have registered yet.</p>
          </div>
        )}
      </div>

      {/* Role Selection Modal */}
      {showRoleModal && selectedUserForApproval && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Approve User: {selectedUserForApproval.username}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Role
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="User"
                      checked={selectedRole === 'User'}
                      onChange={(e) => setSelectedRole(e.target.value as 'User' | 'Admin')}
                      className="mr-2"
                    />
                    <span className="text-sm">User - Standard access to dashboard</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="Admin"
                      checked={selectedRole === 'Admin'}
                      onChange={(e) => setSelectedRole(e.target.value as 'User' | 'Admin')}
                      className="mr-2"
                    />
                    <span className="text-sm">Admin - Full administrative access</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={closeRoleModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveUser}
                  disabled={processingUser === selectedUserForApproval.id}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {processingUser === selectedUserForApproval.id ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                placeholder="Enter email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <Select value={newUser.role} onValueChange={(value: 'User' | 'Admin') => setNewUser({...newUser, role: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">User</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={newUser.status} onValueChange={(value: 'Pending' | 'Approved' | 'Rejected') => setNewUser({...newUser, status: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateUser} disabled={processingUser === -1} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                {processingUser === -1 ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <Input
                value={editUser.username}
                onChange={(e) => setEditUser({...editUser, username: e.target.value})}
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input
                type="email"
                value={editUser.email}
                onChange={(e) => setEditUser({...editUser, email: e.target.value})}
                placeholder="Enter email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <Select value={editUser.role} onValueChange={(value: 'User' | 'Admin') => setEditUser({...editUser, role: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">User</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={editUser.status} onValueChange={(value: 'Pending' | 'Approved' | 'Rejected') => setEditUser({...editUser, status: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateUser} disabled={processingUser === editingUser?.id} className="bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-2" />
                {processingUser === editingUser?.id ? 'Updating...' : 'Update User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuthorizeUsers;