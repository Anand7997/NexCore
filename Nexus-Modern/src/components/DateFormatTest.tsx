import React from 'react';
import { formatExecutionDate } from '@/lib/utils';

const DateFormatTest: React.FC = () => {
  const testDate = "2025-08-01T14:23:12.830000";
  
  React.useEffect(() => {
    console.log('=== DateFormatTest Component ===');
    console.log('Testing date:', testDate);
    console.log('Result:', formatExecutionDate(testDate));
  }, []);

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px' }}>
      <h3>Date Format Test Component</h3>
      <p><strong>Input:</strong> {testDate}</p>
      <p><strong>Output:</strong> {formatExecutionDate(testDate)}</p>
      <p><strong>Direct Date:</strong> {new Date(testDate).toString()}</p>
      <p><strong>toLocaleDateString:</strong> {new Date(testDate).toLocaleDateString()}</p>
      <p><strong>toLocaleTimeString:</strong> {new Date(testDate).toLocaleTimeString()}</p>
    </div>
  );
};

export default DateFormatTest;