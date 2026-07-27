'use client';

import { useRef, useState } from 'react';

export default function DemoUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  function handleChange() {
    const file = fileRef.current?.files?.[0];
    setFileName(file?.name ?? null);
    setUploaded(false);
  }

  function handleUpload() {
    if (!fileName) return;
    // Simulate upload
    setUploaded(true);
  }

  return (
    <main
      data-testid="upload-main"
      className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-start p-10 gap-6"
    >
      <h1 data-testid="upload-heading" className="text-2xl font-bold">
        Upload Fixture
      </h1>
      <p data-testid="upload-description" className="text-gray-400 text-sm">
        File upload target for Playwright web.upload tests.
      </p>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <input
          ref={fileRef}
          id="file-input"
          data-testid="input-file"
          type="file"
          accept=".txt,.json,.png,.jpg"
          onChange={handleChange}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
        />
        {fileName && (
          <p data-testid="selected-filename" className="text-sm text-gray-300">
            Selected: <span className="font-mono">{fileName}</span>
          </p>
        )}
        <button
          data-testid="btn-upload"
          onClick={handleUpload}
          disabled={!fileName}
          className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-semibold"
        >
          Upload
        </button>
        {uploaded && (
          <p data-testid="upload-success" className="text-emerald-400 text-sm" role="status">
            File uploaded successfully.
          </p>
        )}
      </div>
    </main>
  );
}
