import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, Mail, LogOut } from 'lucide-react';

interface PendingUserProps {
  user: {
    id: number;
    username: string;
    email: string;
  };
  onLogout: () => void;
}

const PendingUser: React.FC<PendingUserProps> = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Account Pending Approval
          </CardTitle>
          <CardDescription>
            Your account is waiting for administrator approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              Welcome, <strong>{user.username}</strong>! Your account has been created successfully,
              but requires approval from an administrator before you can access the system.
            </AlertDescription>
          </Alert>

          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-blue-600">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Account Created</p>
                <p className="text-xs text-gray-600">Your registration was successful</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="w-4 h-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Waiting for Approval</p>
                <p className="text-xs text-gray-600">Administrator review in progress</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-400">3</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-400">Access Granted</p>
                <p className="text-xs text-gray-500">Full system access</p>
              </div>
            </div>
          </div>

          <div className="text-center space-y-4">
            <div className="text-sm text-gray-600">
              <p>You will receive an email notification once your account is approved.</p>
              <p className="mt-1">Please check back later or contact your administrator.</p>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="flex-1"
              >
                Check Status
              </Button>
              <Button
                variant="outline"
                onClick={onLogout}
                className="flex-1"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingUser;