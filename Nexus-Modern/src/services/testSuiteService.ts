import { buildApiUrl } from '@/config/api';
 
export interface TestSuiteType {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: string;
  testCount: number;
  lastRun: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}
 
export interface TestCase {
  id: number;
  testcase_id: string;
  name: string;
  description: string;
  project_id: number;
  module_id: number;
  project_name: string;
  module_name: string;
  created_date: string;
  status: string;
  priority: string;
  isInSuite?: boolean;
  order_index?: number;
}
 
class TestSuiteService {
  private baseUrl = '/api/custom-test-suites';
 
  // Default test suites that should always be available
  private defaultSuites: Omit<TestSuiteType, 'id' | 'created_at' | 'updated_at'>[] = [
    {
      name: 'Smoke Tests',
      description: 'Quick tests to verify basic functionality',
      icon: 'Zap',
      gradient: 'from-yellow-500 to-orange-500',
      testCount: 0,
      lastRun: 'Never',
      status: 'active'
    },
    {
      name: 'Sanity Tests',
      description: 'Tests to verify core features work correctly',
      icon: 'Shield',
      gradient: 'from-green-500 to-emerald-500',
      testCount: 0,
      lastRun: 'Never',
      status: 'active'
    },
    {
      name: 'Regression Tests',
      description: 'Comprehensive tests to ensure no functionality is broken',
      icon: 'RotateCcw',
      gradient: 'from-blue-500 to-indigo-500',
      testCount: 0,
      lastRun: 'Never',
      status: 'active'
    }
  ];
 
  async initializeDefaultSuites(): Promise<void> {
    try {
      // Check if default suites already exist
      const existingSuites = await this.getAllTestSuites();
      const existingNames = existingSuites.map(suite => suite.name.toLowerCase());
 
      // Create default suites that don't exist
      for (const defaultSuite of this.defaultSuites) {
        if (!existingNames.includes(defaultSuite.name.toLowerCase())) {
          await this.createTestSuite(defaultSuite);
        }
      }
    } catch (error) {
      console.error('Error initializing default suites:', error);
      throw error;
    }
  }
 
  async getAllTestSuites(): Promise<TestSuiteType[]> {
    try {
      const response = await fetch(buildApiUrl(this.baseUrl));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.test_suites || [];
    } catch (error) {
      console.error('Error fetching test suites:', error);
      throw error;
    }
  }
 
  async createTestSuite(testSuite: Omit<TestSuiteType, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    try {
      const response = await fetch(buildApiUrl(this.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testSuite),
      });
 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
 
      const data = await response.json();
      return data.id;
    } catch (error) {
      console.error('Error creating test suite:', error);
      throw error;
    }
  }
 
  async updateTestSuite(id: string, testSuite: Partial<TestSuiteType>): Promise<void> {
    try {
      const response = await fetch(buildApiUrl(`${this.baseUrl}/${id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testSuite),
      });
 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating test suite:', error);
      throw error;
    }
  }
 
  isDefaultSuite(suiteName: string): boolean {
    const defaultNames = this.defaultSuites.map(suite => suite.name.toLowerCase());
    return defaultNames.includes(suiteName.toLowerCase());
  }
 
  async deleteTestSuite(id: string): Promise<void> {
    try {
      // First check if this is a default suite
      const suites = await this.getAllTestSuites();
      const suiteToDelete = suites.find(suite => suite.id === id);
     
      if (suiteToDelete && this.isDefaultSuite(suiteToDelete.name)) {
        throw new Error('Cannot delete default test suites (Smoke, Sanity, Regression)');
      }
 
      const response = await fetch(buildApiUrl(`${this.baseUrl}/${id}`), {
        method: 'DELETE',
      });
 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error deleting test suite:', error);
      throw error;
    }
  }
 
  async getTestSuiteTestCases(suiteId: string): Promise<TestCase[]> {
    try {
      const response = await fetch(buildApiUrl(`${this.baseUrl}/${suiteId}/test-cases`));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.test_cases || [];
    } catch (error) {
      console.error('Error fetching test suite test cases:', error);
      throw error;
    }
  }
 
  async saveTestSuiteTestCases(suiteId: string, testCases: TestCase[]): Promise<void> {
    try {
      const response = await fetch(buildApiUrl(`${this.baseUrl}/${suiteId}/test-cases`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test_cases: testCases }),
      });
 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error saving test suite test cases:', error);
      throw error;
    }
  }
}
 
export const testSuiteService = new TestSuiteService();