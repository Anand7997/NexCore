import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Trash2 } from 'lucide-react';

interface ExcelFile {
  id: number;
  file_name: string;
  original_name: string;
  uploaded_at: string;
  file_size: number;
}

interface ExcelUploadSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  testCaseName: string;
  onMappingSuccess?: () => void;
}

const ExcelUploadSidebar: React.FC<ExcelUploadSidebarProps> = ({
  isOpen,
  onClose,
  testCaseName,
  onMappingSuccess
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<ExcelFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const { toast } = useToast();

  // Load uploaded files when sidebar opens
  useEffect(() => {
    if (isOpen) {
      loadUploadedFiles();
    }
  }, [isOpen]);

  const loadUploadedFiles = async () => {
    try {
      setIsLoadingFiles(true);
      const userEmail = localStorage.getItem('userEmail') || 'anonymous';
      const response = await fetch(buildApiUrl('/api/excel-files'), {
        headers: {
          'X-User-Email': userEmail
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load files');
      }

      const data = await response.json();
      setUploadedFiles(data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
      toast({
        title: "Error",
        description: "Failed to load uploaded files",
        variant: "destructive"
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload only .xlsx or .xls files",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: "Please upload files smaller than 10MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploading(true);
      const userEmail = localStorage.getItem('userEmail') || 'anonymous';

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(buildApiUrl('/api/excel-files/upload'), {
        method: 'POST',
        headers: {
          'X-User-Email': userEmail
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();

      toast({
        title: "Upload Successful",
        description: `File "${result.original_name}" uploaded successfully`,
      });

      // Reload files list
      await loadUploadedFiles();

      // Clear file input
      event.target.value = '';

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleMapValues = async () => {
    if (!selectedFileId) {
      toast({
        title: "No File Selected",
        description: "Please select an Excel file to map values",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsMapping(true);

      const userEmail = localStorage.getItem('userEmail') || 'anonymous';
      const response = await fetch(buildApiUrl(`/api/excel-files/${selectedFileId}/parse`), {
        headers: {
          'X-User-Email': userEmail
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse Excel file');
      }

      const data = await response.json();

      if (!data.values || data.values.length === 0) {
        throw new Error('No valid data found in the Excel file');
      }

      // Update the test case with the mapped Excel sheet name
      const excelFileId = data.file_id;
      const sheetName = data.sheet_name || '';
      const dataSets = data.data_sets;
      console.log('[EXCEL_MAPPING] Updating test case:', testCaseName, 'with fileId:', excelFileId, 'sheet:', sheetName);
      
      const updateResponse = await fetch(buildApiUrl(`/api/testcases/${encodeURIComponent(testCaseName)}/mapped-excel`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        body: JSON.stringify({
          excelFileId: excelFileId,
          sheetName: sheetName,
          dataSets: dataSets
        })
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        console.error('[EXCEL_MAPPING] Failed to update test case:', errorData);
      } else {
        const updateData = await updateResponse.json();
        console.log('[EXCEL_MAPPING] Successfully updated test case:', updateData);
      }

      toast({
        title: "Mapping Successful",
        description: `Found ${dataSets || 0} datasets (columns) mapped to test case`,
      });

      // Call the success callback if provided
      if (onMappingSuccess) {
        onMappingSuccess();
      }

      // Close sidebar after mapping
      onClose();

    } catch (error) {
      console.error('Mapping error:', error);
      toast({
        title: "Mapping Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsMapping(false);
    }
  };

  

  const handleDeleteFile = async (fileId: number, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    try {
      const userEmail = localStorage.getItem('userEmail') || 'anonymous';
      const response = await fetch(buildApiUrl(`/api/excel-files/${fileId}`), {
        method: 'DELETE',
        headers: {
          'X-User-Email': userEmail
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete file');
      }

      toast({
        title: "File Deleted",
        description: `"${fileName}" has been deleted successfully`,
      });

      // Clear selection if deleted file was selected
      if (selectedFileId === fileId) {
        setSelectedFileId(null);
      }

      // Reload files list
      await loadUploadedFiles();

    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Select Excel Values</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Upload Section */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Upload Excel File</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="hidden"
                      id="excel-upload"
                    />
                    <label
                      htmlFor="excel-upload"
                      className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      {isUploading ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-6 w-6 text-blue-500 animate-spin mb-2" />
                          <span className="text-sm text-gray-600">Uploading...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <Upload className="h-6 w-6 text-gray-400 mb-2" />
                          <span className="text-sm text-gray-600">Click to upload .xlsx or .xls</span>
                          <span className="text-xs text-gray-400 mt-1">Max 10MB</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Files List */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Uploaded Files</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin mr-2" />
                    <span className="text-sm text-gray-600">Loading files...</span>
                  </div>
                ) : uploadedFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No files uploaded yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {uploadedFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          selectedFileId === file.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div 
                          className="flex items-center space-x-3 flex-1 cursor-pointer"
                          onClick={() => setSelectedFileId(file.id)}
                        >
                          <FileSpreadsheet className="h-4 w-4 text-green-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-900 truncate max-w-32">
                              {file.original_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(file.file_size)} • {formatDate(file.uploaded_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {selectedFileId === file.id && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(file.id, file.original_name);
                            }}
                            className="p-1 hover:bg-red-100 rounded transition-colors"
                            title="Delete file"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Button */}
            <div className="pt-4 border-t border-gray-200">
              <div className="space-y-2">
                <Button
                  onClick={handleMapValues}
                  disabled={!selectedFileId || isMapping}
                  className="w-full"
                >
                  {isMapping ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mapping Values...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Map Test Values
                    </>
                  )}
                </Button>

                {/* Execution must be triggered from Test Execution Dashboard; sidebar only maps files */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExcelUploadSidebar;
