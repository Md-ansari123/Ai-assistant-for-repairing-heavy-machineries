import React, { useState, useEffect, useCallback } from 'react';
import { CameraCapture } from './CameraCapture';
import { CameraIcon } from './icons/CameraIcon';
import { useLanguage } from '../contexts/LanguageContext';
import SpeechToTextInput from './SpeechToTextInput';


interface ProblemInputFormProps {
  onSubmit: (problemDescription: string, mediaFile: File | null) => void;
  isLoading: boolean;
}

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES];
const ALLOWED_MIME_TYPES_STRING = ALLOWED_MIME_TYPES.join(',');
const DRAFT_STORAGE_KEY = 'problemDescriptionDraft';
const SAVE_DELAY = 500; // ms

const ProblemInputForm: React.FC<ProblemInputFormProps> = ({ onSubmit, isLoading }) => {
  const { t } = useLanguage();
  const [problemDescription, setProblemDescription] = useState<string>('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Load draft from localStorage on initial mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        setProblemDescription(savedDraft);
      }
    } catch (e) {
      console.error("Failed to load description draft from localStorage", e);
    }
  }, []);

  // Auto-save draft to localStorage with a debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      try {
        if (problemDescription) {
          localStorage.setItem(DRAFT_STORAGE_KEY, problemDescription);
        } else {
          // If description is cleared, remove the draft
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      } catch (e) {
        console.error("Failed to save description draft to localStorage", e);
      }
    }, SAVE_DELAY);

    // Cleanup timeout on component unmount or if description changes
    return () => {
      clearTimeout(handler);
    };
  }, [problemDescription]);

  const validateDescription = () => {
    if (problemDescription.trim() === '') {
      setDescriptionError(t('errorDescriptionRequired'));
      return false;
    }
    setDescriptionError(null);
    return true;
  };

  const handleFile = (file: File | null) => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }

    if (!file) {
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      setMediaError(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setMediaError(t('errorInvalidFileTypeVideo'));
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMediaError(t('errorFileSize', { size: MAX_FILE_SIZE_MB }));
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      return;
    }

    setMediaFile(file);
    setMediaError(null);
    setMediaPreview(URL.createObjectURL(file));
    setMediaType(file.type.startsWith('image/') ? 'image' : 'video');
  };

  const handleMediaCaptured = (blob: Blob, type: 'image' | 'video') => {
    const extension = type === 'image' ? 'jpg' : 'webm';
    const mimeType = type === 'image' ? 'image/jpeg' : 'video/webm';
    const fileName = `capture.${extension}`;
    
    const file = new File([blob], fileName, { type: mimeType });
    handleFile(file);
    setIsCameraOpen(false);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
    e.target.value = '';
  };
  
  const handleRemoveMedia = () => {
    handleFile(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isDescriptionValid = validateDescription();
    if (isDescriptionValid && !isLoading) {
      onSubmit(problemDescription, mediaFile);
      // Clear the draft from localStorage after successful submission
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (e) {
        console.error("Failed to remove description draft from localStorage", e);
      }
    }
  };
  
  useEffect(() => {
    return () => {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview);
      }
    };
  }, [mediaPreview]);

  const handleTranscript = useCallback((transcript: string) => {
    setProblemDescription(prev => prev + transcript);
  }, []);

  return (
    <>
      {isCameraOpen && (
        <CameraCapture 
          onCapture={handleMediaCaptured}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
      <form onSubmit={handleSubmit} className="bg-gray-800/50 p-6 rounded-lg shadow-lg border border-gray-700">
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="problem-description" className="block text-lg font-medium text-yellow-300">
              {t('describeIssue')}
            </label>
            {isListening && (
              <div className="flex items-center gap-2 text-sm text-yellow-300 animate-pulse" aria-live="polite">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span>{t('listening')}</span>
              </div>
            )}
          </div>
          <div className="relative w-full">
            <textarea
              id="problem-description"
              rows={5}
              className={`w-full p-3 pr-14 bg-gray-900 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition duration-200 text-gray-200 placeholder-gray-500 ${descriptionError ? 'border-red-500 ring-red-500/50' : 'border-gray-600'}`}
              placeholder={t('describeIssuePlaceholder')}
              value={problemDescription}
              onChange={(e) => {
                setProblemDescription(e.target.value);
                if (descriptionError) {
                    setDescriptionError(null);
                }
              }}
              onBlur={validateDescription}
              disabled={isLoading}
              aria-invalid={!!descriptionError}
              aria-describedby={descriptionError ? "description-error" : undefined}
              title={t('tooltipDescription')}
            />
            <SpeechToTextInput 
              onTranscript={handleTranscript}
              disabled={isLoading}
              onListeningChange={setIsListening}
            />
          </div>
          {descriptionError && (
            <p id="description-error" className="text-sm text-red-400 mt-2">
              {descriptionError}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-lg font-medium text-yellow-300 mb-2">
            {t('addMediaOptional')}
          </label>
          
          {mediaPreview ? (
              <div className="mt-2 text-center">
                  <div className="relative inline-block border-2 border-green-500 p-1 rounded-md bg-gray-900">
                      {mediaType === 'image' && (
                        <img src={mediaPreview} alt="Upload preview" className="max-h-48 rounded-md object-contain mx-auto" />
                      )}
                      {mediaType === 'video' && (
                        <video src={mediaPreview} controls autoPlay muted loop playsInline className="max-h-48 rounded-md object-contain mx-auto" />
                      )}
                      <button 
                          type="button" 
                          onClick={handleRemoveMedia}
                          disabled={isLoading}
                          className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-1 leading-none hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-500"
                          aria-label={t('removeMedia')}
                          title={t('tooltipRemoveMedia')}
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                      </button>
                  </div>
                  {mediaError && <p className="text-sm text-red-400 mt-2">{mediaError}</p>}
              </div>
          ) : (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragOver ? 'border-yellow-400 bg-gray-700/50' : 'border-gray-600 hover:border-gray-500'} ${isLoading ? 'cursor-not-allowed bg-gray-800' : 'cursor-pointer bg-gray-800/50'}`}
            >
              <input
                id="file-upload"
                type="file"
                className="sr-only"
                onChange={handleMediaChange}
                accept={ALLOWED_MIME_TYPES_STRING}
                disabled={isLoading}
              />
              <label htmlFor="file-upload" className={`flex flex-col items-center justify-center ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'}`} title={t('tooltipUploadArea')}>
                  <svg className="w-12 h-12 mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  <p className="mb-2 text-sm text-gray-400"><span className="font-semibold text-yellow-300">{t('uploadFile')}</span> {t('dragAndDrop')}</p>
                  <p className="text-xs text-gray-500">{t('fileTypesVideo', { size: MAX_FILE_SIZE_MB })}</p>
                  {mediaError && <p className="text-sm text-red-400 mt-2">{mediaError}</p>}
              </label>
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="hidden sm:block border-t border-gray-600 flex-grow"></div>
          <span className="text-gray-500 uppercase text-sm font-semibold">{t('orSeparator')}</span>
          <div className="border-t border-gray-600 flex-grow"></div>
        </div>

        <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-5 text-base font-medium text-gray-200 focus:outline-none bg-gray-700 rounded-lg border border-gray-600 hover:bg-gray-600 hover:text-white focus:z-10 focus:ring-4 focus:ring-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('tooltipTakePhoto')}
            >
              <CameraIcon className="w-5 h-5 mr-2" />
              {t('takePhoto')}
            </button>
        </div>

        <div className="mt-4">
            <button
                type="submit"
                disabled={isLoading}
                className="w-full text-gray-900 bg-yellow-400 hover:bg-yellow-500 focus:ring-4 focus:outline-none focus:ring-yellow-300 font-medium rounded-lg text-base px-5 py-3 text-center transition-colors disabled:bg-yellow-800 disabled:cursor-not-allowed disabled:text-yellow-400"
                title={t('tooltipSubmit')}
            >
                {isLoading ? t('generatingGuide') : t('getRepairGuide')}
            </button>
        </div>
      </form>
    </>
  );
};

export default ProblemInputForm;