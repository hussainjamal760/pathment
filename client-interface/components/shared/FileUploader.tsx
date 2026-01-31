'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, File, Image, FileText } from 'lucide-react';

interface FileUploaderProps {
  files: File[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (index: number) => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
}

export default function FileUploader({
  files,
  onFilesAdded,
  onFileRemoved,
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024 // 10MB
}: FileUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remainingSlots = maxFiles - files.length;
      const filesToAdd = acceptedFiles.slice(0, remainingSlots);
      onFilesAdded(filesToAdd);
    },
    [files.length, maxFiles, onFilesAdded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize,
    disabled: files.length >= maxFiles
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-600" aria-label="Image file" />;
    } else if (file.type === 'application/pdf') {
      return <FileText className="w-5 h-5 text-red-600" aria-label="PDF file" />;
    }
    return <File className="w-5 h-5 text-slate-600" aria-label="File" />;
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}
          ${files.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragActive ? 'text-blue-500' : 'text-slate-400'}`} />
        <p className="text-slate-700 mb-2">
          {isDragActive ? 'Drop files here...' : 'Drag & drop files here, or click to select'}
        </p>
        <p className="text-sm text-slate-500">
          Max {maxFiles} files, up to {formatFileSize(maxSize)} each
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg"
            >
              {getFileIcon(file)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onFileRemoved(index)}
                className="p-1 hover:bg-slate-200 rounded transition-colors"
                title="Remove file"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
