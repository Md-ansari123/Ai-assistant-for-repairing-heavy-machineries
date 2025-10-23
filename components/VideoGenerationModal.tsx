import React from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface VideoGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  videoUrl: string | null;
  error: string | null;
  prompt: string | null;
}

const LoadingMessages = [
  'warmingUpVideoGenerator',
  'storyboardingTheScene',
  'renderingHighFidelityFrames',
  'applyingFinalTouches',
  'compressingVideoForPlayback',
];

const VideoGenerationModal: React.FC<VideoGenerationModalProps> = ({ isOpen, onClose, isLoading, videoUrl, error, prompt }) => {
  const { t } = useLanguage();
  const [loadingMessageIndex, setLoadingMessageIndex] = React.useState(0);

  React.useEffect(() => {
    let interval: number;
    if (isLoading) {
      setLoadingMessageIndex(0); // Reset on open
      interval = window.setInterval(() => {
        setLoadingMessageIndex(prevIndex => (prevIndex + 1) % LoadingMessages.length);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative bg-gray-800 border-2 border-yellow-500/50 shadow-2xl rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">{t('videoGenerationTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label={t('closeVideo')}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="p-6 flex-grow overflow-y-auto">
          {prompt && <p className="text-gray-400 mb-4 italic">"{prompt}"</p>}

          {isLoading && (
            <div className="text-center">
              <div className="flex justify-center items-center h-48">
                <svg className="animate-spin h-12 w-12 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <p className="text-lg text-yellow-300 animate-pulse">{t(LoadingMessages[loadingMessageIndex])}...</p>
              <p className="text-sm text-gray-400 mt-2">{t('videoGenerationInfo')}</p>
            </div>
          )}

          {error && (
            <div className="text-center text-red-300 bg-red-900/30 p-4 rounded-md">
              <p><strong>{t('errorLabel')}:</strong> {error}</p>
            </div>
          )}

          {videoUrl && !isLoading && (
            <div className="aspect-video bg-black rounded-md overflow-hidden">
              <video key={videoUrl} src={videoUrl} controls autoPlay muted loop playsInline className="w-full h-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoGenerationModal;