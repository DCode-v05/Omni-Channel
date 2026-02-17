import { useRef } from 'react';
import { PaperclipIcon, XIcon } from './Icons';

interface AttachmentButtonProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  acceptedFormats?: string;
  maxSizeMB?: number;
}

export const AttachmentButton = ({
  onFileSelect,
  selectedFile,
  acceptedFormats = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg',
  maxSizeMB = 20,
}: AttachmentButtonProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`File is too large. Maximum size is ${maxSizeMB}MB`);
      return false;
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];
    
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please select PDF, DOCX, TXT, PNG, JPG, or JPEG file.');
      return false;
    }

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onFileSelect(file);
    }
  };

  const handleButtonClick = () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={handleButtonClick}
        className="attachment-icon-button"
        title="Attach file"
      >
        <PaperclipIcon className="icon" />
      </button>
    </>
  );
};

export const FilePreview = ({ file, onRemove }: { file: File; onRemove: () => void }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="file-preview-chip">
      <span className="file-name">{file.name}</span>
      <span className="file-size">{formatFileSize(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="remove-file-button"
        title="Remove file"
      >
        <XIcon className="remove-icon" />
      </button>
    </div>
  );
};
