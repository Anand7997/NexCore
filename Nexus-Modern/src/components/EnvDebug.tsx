import React from 'react';
import { API_BASE_URL } from '@/config/api';

const EnvDebug: React.FC = () => {
  return (
    <div style={{ 
      position: 'fixed', 
      top: '10px', 
      right: '10px', 
      background: '#f0f0f0', 
      padding: '10px', 
      border: '1px solid #ccc',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9999
    }}>
      <strong>Environment Debug:</strong><br/>
      API_BASE_URL: {API_BASE_URL}<br/>
      VITE_ENV: {import.meta.env.VITE_ENV}<br/>
      NODE_ENV: {import.meta.env.NODE_ENV}
    </div>
  );
};

export default EnvDebug;