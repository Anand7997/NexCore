import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildApiUrl } from '../config/api';

interface Function {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface Assignment {
  id: number;
  user_email: string;
  username: string;
  role: string;
  assigned_on: string;
}

const CANONICAL_FUNCTIONS: Function[] = [
  {
    id: 'requirements',
    name: 'Requirements & Feasibility Analysis',
    description: 'Analyze requirements and assess feasibility',
    icon: 'FileText',
    color: 'bg-blue-500',
  },
  {
    id: 'authentication',
    name: 'Authentication',
    description: 'Manage users and function-level authorization',
    icon: 'Shield',
    color: 'bg-violet-500',
  },
  {
    id: 'planning',
    name: 'Automation Planning',
    description: 'Plan automation strategy and timeline',
    icon: 'Calendar',
    color: 'bg-green-500',
  },
  {
    id: 'development',
    name: 'Automation Development',
    description: 'Develop automated test scripts',
    icon: 'Code',
    color: 'bg-purple-500',
  },
  {
    id: 'test-lab',
    name: 'Test Lab',
    description: 'Execute and monitor test runs',
    icon: 'TestTube',
    color: 'bg-orange-500',
  },
  {
    id: 'reporting',
    name: 'Reporting',
    description: 'Generate test reports and analytics',
    icon: 'BarChart3',
    color: 'bg-red-500',
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    description: 'Maintain and update test assets',
    icon: 'Settings',
    color: 'bg-gray-500',
  },
];

interface AuthorizeFunctionsProps {
  onFunctionSelect?: (func: Function) => void;
}

const AuthorizeFunctions: React.FC<AuthorizeFunctionsProps> = ({ onFunctionSelect }) => {
  const [functions, setFunctions] = useState<Function[]>([]);
  const [assignments, setAssignments] = useState<{[key: string]: Assignment[]}>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const functionsData = await fetchFunctions();
      // Load assignments for all functions
      if (functionsData) {
        await Promise.all(functionsData.map((func: Function) => fetchAssignments(func.id)));
      }
      setError(null);
    } catch (err: any) {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFunctions = async (): Promise<Function[]> => {
    const response = await fetch(buildApiUrl('/api/functions'));
    const result = await response.json();
    if (response.ok) {
      const functionsById = new Map((result.functions || []).map((func: Function) => [func.id, func]));
      const canonicalFunctions = CANONICAL_FUNCTIONS.map((func) => ({
        ...func,
        ...(functionsById.get(func.id) || {}),
        name: func.name,
        description: func.description,
        icon: func.icon,
        color: func.color,
      }));

      setFunctions(canonicalFunctions);
      return canonicalFunctions;
    }
    setFunctions(CANONICAL_FUNCTIONS);
    return CANONICAL_FUNCTIONS;
  };

  const fetchAssignments = async (functionName: string) => {
    const response = await fetch(buildApiUrl(`/api/function-assignments/${functionName}`));
    const result = await response.json();
    if (response.ok) {
      setAssignments(prev => ({
        ...prev,
        [functionName]: result.assignments
      }));
    }
  };

  const getFunctionAssignments = (functionName: string) => {
    return assignments[functionName] || [];
  };

  const handleFunctionClick = (func: Function) => {
    if (onFunctionSelect) {
      onFunctionSelect(func);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Function Authorization</h1>
          <p className="text-gray-600 mt-1">Click on function blocks to manage user assignments</p>
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

      {/* Functions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {functions.map((func) => (
          <Card
            key={func.id}
            className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            onClick={() => handleFunctionClick(func)}
          >
            <CardHeader>
              <CardTitle className="flex items-center space-x-3">
                <div className={`flex-shrink-0 h-10 w-10 rounded-lg ${func.color} flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">{func.icon.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{func.name}</h3>
                  <p className="text-sm text-gray-500">{func.description}</p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 text-lg px-4 py-2">
                  {getFunctionAssignments(func.id).length} Users Assigned
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
              <p>Click on any function block to navigate to the user management page.</p>
              <p className="mt-1">There you can assign and remove users from the selected function.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthorizeFunctions;
