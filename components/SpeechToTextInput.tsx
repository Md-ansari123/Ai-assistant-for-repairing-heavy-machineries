import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MicrophoneIcon } from './icons/MicrophoneIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface SpeechToTextInputProps {
  onTranscript: (transcript: string) => void;
  disabled: boolean;
  onListeningChange: (isListening: boolean) => void;
}

// Minimal interfaces for Web Speech API to ensure TS compatibility in all environments.
interface SpeechRecognitionResult {
  isFinal: boolean;
  [key: number]: { transcript: string; };
}
interface SpeechRecognitionResultList {
  length: number;
  [key: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

// Check for browser compatibility
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechSupported = !!SpeechRecognition;

const SpeechToTextInput: React.FC<SpeechToTextInputProps> = ({ onTranscript, disabled, onListeningChange }) => {
  const { t, language } = useLanguage();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // This ref pattern is needed to ensure the onend handler can call the latest version of startListening
  // without creating dependency loops.
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    onListeningChange(isListening);
  }, [isListening, onListeningChange]);
  
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // Detach handlers to prevent any lingering events (like onend restart) from firing.
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // This is the single place we manually set listening state to false.
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    // Prevent starting if already running, disabled, or not supported.
    if (recognitionRef.current || disabled || !isSpeechSupported) return;

    const recognition = new SpeechRecognition() as SpeechRecognitionInstance;
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        onTranscript(finalTranscript.trim() + ' ');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      // For fatal errors that require user action, alert them and stop permanently.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        alert(t('microphonePermissionDeniedError'));
        stopListening();
      }
      // For other non-fatal errors (like 'no-speech' or 'network'), we do nothing.
      // The onend event will fire next and handle the automatic restart.
    };

    recognition.onend = () => {
      // This onend handler's only job is to restart the service.
      // If a manual stop was triggered, the `stopListening` function would have
      // already nulled this handler, preventing the restart.
      recognitionRef.current = null; // Clear the ref to allow a new instance.
      startListeningRef.current(); // Call the latest start function.
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error("Could not start speech recognition:", err);
      stopListening(); // Ensure we clean up if start() fails.
    }
  }, [disabled, language, onTranscript, stopListening, t]);

  // Keep the ref updated with the latest callback instance.
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const handleToggleListening = async () => {
    if (disabled) return;
    
    if (isListening) {
      stopListening();
    } else {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permissionStatus.state === 'denied') {
          alert(t('microphonePermissionDeniedError'));
          return;
        }
      } catch (e) {
        console.warn("Permissions API not supported, will rely on recognition prompt.", e);
      }
      startListening();
    }
  };

  if (!isSpeechSupported) {
    return (
      <button type="button" disabled className="absolute bottom-3 right-3 p-2 rounded-full bg-gray-600 cursor-not-allowed" title={t('voiceUnsupported')}>
        <MicrophoneIcon className="w-5 h-5 text-gray-400" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggleListening}
      disabled={disabled}
      className={`absolute bottom-3 right-3 p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-gray-600 ${
        isListening
          ? 'bg-red-500 text-white animate-pulse'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
      aria-label={isListening ? t('stopRecording') : t('startRecording')}
      title={isListening ? t('stopRecording') : t('startRecording')}
    >
      <MicrophoneIcon className="w-5 h-5" />
    </button>
  );
};

export default SpeechToTextInput;