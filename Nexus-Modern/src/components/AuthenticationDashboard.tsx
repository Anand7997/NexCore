import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Shield, UserCheck } from 'lucide-react';
import { useAuthorization } from '@/hooks/useAuthorization';
import AuthorizeUsers from './AuthorizeUsers';
import AuthorizeFunctions from './AuthorizeFunctions';
import PageBackButton from '@/components/ui/page-back-button';
import PhaseStepCard from '@/components/ui/phase-step-card';

interface User {
  id: number;
  username: string;
  email: string;
  role?: string;
  status?: string;
  last_login: string;
}

interface AuthenticationDashboardProps {
  onBack?: () => void;
  onFunctionSelect?: (func: any) => void;
  initialPage?: 'blocks' | 'authorize-users' | 'authorize-functions';
}

const AuthenticationDashboard: React.FC<AuthenticationDashboardProps> = ({
  onBack,
  onFunctionSelect,
  initialPage = 'blocks',
}) => {
  const [currentPage, setCurrentPage] = useState<'blocks' | 'authorize-users' | 'authorize-functions'>(initialPage);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { authorized, loading, error } = useAuthorization('authentication');

  useEffect(() => {
    const savedUser = localStorage.getItem('qfast_user');
    if (!savedUser) {
      return;
    }

    try {
      setCurrentUser(JSON.parse(savedUser));
    } catch (parseError) {
      console.error('Error parsing saved user:', parseError);
    }
  }, []);

  useEffect(() => {
    setCurrentPage(initialPage);
  }, [initialPage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-gray-600">Checking authorization...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-red-600">Error checking authorization: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PageBackButton onClick={onBack} label="Go Back" className="mb-6" />

          <div className="bg-white shadow rounded-lg p-8 text-center">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You are not authorized to access authentication settings.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageBackButton onClick={onBack} label="Go Back" className="mb-6" />

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Dashboard</h2>
          <p className="text-gray-600 mb-8">Manage user access and function-level authorization controls</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          {currentPage === 'blocks' && (
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Authentication</h2>
              <p className="text-gray-600 mb-8">Select an option to manage authentication and authorization</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <PhaseStepCard
                  icon={UserCheck}
                  title="Authorize Users"
                  description="Manage user access and approval settings"
                  step="Step 1"
                  accent="blue"
                  onClick={() => setCurrentPage('authorize-users')}
                />
                <PhaseStepCard
                  icon={Settings}
                  title="Authorize Functions"
                  description="Configure function-level permissions"
                  step="Step 2"
                  accent="emerald"
                  onClick={() => setCurrentPage('authorize-functions')}
                />
              </div>
            </div>
          )}

          {currentPage === 'authorize-users' && (
            <div>
              <div className="p-4 border-b border-gray-200">
                <Button variant="ghost" onClick={() => setCurrentPage('blocks')} className="mb-2">
                  Back to Options
                </Button>
              </div>
              <div className="p-6">
                {currentUser ? (
                  <AuthorizeUsers currentUser={currentUser} />
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Loading user information...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentPage === 'authorize-functions' && (
            <div>
              <div className="p-4 border-b border-gray-200">
                <Button variant="ghost" onClick={() => setCurrentPage('blocks')} className="mb-2">
                  Back to Options
                </Button>
              </div>
              <div className="p-6">
                <AuthorizeFunctions onFunctionSelect={onFunctionSelect} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthenticationDashboard;
