
// Data Validation Utility - Prevents corrupt data
// Comments added for changes
export const validateTestCase = (testCase: any) => {
  if (!testCase) return false;
  if (!testCase.id || !testCase.name) return false;
  if (!testCase.project_id) return false;
  return true;
};

export const validateProject = (project: any) => {
  if (!project) return false;
  if (!project.id || !project.name) return false;
  return true;
};

export const cleanData = (data: any[]) => {
  return data.filter(item => item && typeof item === 'object');
};
