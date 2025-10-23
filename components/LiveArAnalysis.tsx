import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type, Modality, LiveServerMessage } from "@google/genai";
import { useLanguage } from '../contexts/LanguageContext';
import { CloseIcon } from './icons/CloseIcon';
import type { ArComponent } from '../types';
import { SmallSpinner } from './icons/SmallSpinner';

interface LiveArAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
}

const FRAME_RATE = 5; // Send a frame every 1/5th of a second
const JPEG_QUALITY = 0.7;

// Function to convert a Blob to a Base64 string
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // We only want the Base64 data, not the "data:mime/type;base64," part
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error("Failed to convert blob to base64 string."));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const reportComponentsFunction: FunctionDeclaration = {
  name: 'reportVisibleComponents',
  description: 'Reports the components currently visible in the video frame.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      components: {
        type: Type.ARRAY,
        description: 'An array of components identified in the frame.',
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'The name of the component.' },
            boundingBox: {
              type: Type.OBJECT,
              description: 'The normalized bounding box of the component.',
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER },
              },
              required: ['x', 'y', 'width', 'height'],
            },
          },
          required: ['name', 'boundingBox'],
        },
      },
    },
    required: ['components'],
  },
};

const LiveArAnalysis: React.FC<LiveArAnalysisProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [detectedComponents, setDetectedComponents] = useState<ArComponent[]>([]);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  const stopFrameInterval = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);
  
  const closeSession = (sessionPromise: Promise<any> | null) => {
    stopFrameInterval();
    if(sessionPromise) {
        sessionPromise.then(session => session?.close());
    }
  };
  
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    
    let sessionPromise: ReturnType<GoogleGenAI['live']['connect']> | null = null;
    
    const startArSession = async () => {
      setIsInitializing(true);
      setError(null);
      setDetectedComponents([]);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment',
            frameRate: { ideal: 15 }
          },
          audio: true, // Required by the API, even if not used for speech
        });
        streamRef.current = stream;

        // Mute audio track as we are not sending voice
        stream.getAudioTracks().forEach(track => track.enabled = false);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    const videoEl = videoRef.current;
                    const canvasEl = canvasRef.current;
                    if (!videoEl || !canvasEl) return;
                    const ctx = canvasEl.getContext('2d');
                    if (!ctx) return;
                    
                    frameIntervalRef.current = window.setInterval(() => {
                        canvasEl.width = videoEl.videoWidth;
                        canvasEl.height = videoEl.videoHeight;
                        ctx.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);
                        canvasEl.toBlob(
                            async (blob) => {
                                if (blob) {
                                    const base64Data = await blobToBase64(blob);
                                    sessionPromise?.then((session) => {
                                        session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
                                    });
                                }
                            },
                            'image/jpeg',
                            JPEG_QUALITY
                        );
                    }, 1000 / FRAME_RATE);
                },
                onmessage: (message: LiveServerMessage) => {
                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'reportVisibleComponents') {
                                setDetectedComponents(fc.args.components as ArComponent[]);
                                sessionPromise?.then((session) => {
                                    session.sendToolResponse({
                                      functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } }
                                    });
                                });
                            }
                        }
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live session error:', e);
                    setError(t('arConnectionError'));
                    stopFrameInterval();
                },
                onclose: () => {
                    stopFrameInterval();
                },
            },
            config: {
                responseModalities: [Modality.AUDIO], // Required by API
                tools: [{ functionDeclarations: [reportComponentsFunction] }],
                systemInstruction: `You are a master AI technician specializing in the analysis of heavy mining machinery. Your sole function is to analyze the incoming video frames with extreme precision.
Your primary task is to identify and locate critical components relevant to mining equipment such as excavators, dump trucks, loaders, and drills.
Focus on identifying specific parts like:
- Hydraulic cylinders and hoses
- Engine blocks and manifolds
- Transmissions and gearboxes
- Undercarriage components (tracks, rollers, sprockets)
- Buckets, booms, and arms
- Electrical control panels and wiring harnesses
- Filters (oil, fuel, air)
- Radiators and cooling systems

For each component you positively identify, you MUST immediately call the 'reportVisibleComponents' function. Provide the precise, tightest possible normalized bounding box for each component.
Do not engage in conversation. Your output must only be function calls.`,
            },
        });

      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError(t('cameraPermissionDeniedError'));
        } else {
            setError(t('cameraAccessError', { message: err.message }));
        }
        console.error("AR mode error:", err);
      } finally {
        setIsInitializing(false);
      }
    };
    
    startArSession();

    return () => {
        stopFrameInterval();
        stopStream();
        closeSession(sessionPromise);
    };
  }, [isOpen, stopFrameInterval, stopStream, t]);

  const onVideoReady = () => {
    if (videoRef.current) {
        setVideoSize({ width: videoRef.current.clientWidth, height: videoRef.current.clientHeight });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="ar-mode-title">
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" onCanPlay={onVideoReady} />
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay for Bounding Boxes */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ width: videoSize.width, height: videoSize.height, margin: 'auto' }}>
            {detectedComponents.map((component, index) => (
                <div key={index} className="absolute border-2 border-yellow-400 transition-all duration-200" style={{
                    left: `${component.boundingBox.x * 100}%`,
                    top: `${component.boundingBox.y * 100}%`,
                    width: `${component.boundingBox.width * 100}%`,
                    height: `${component.boundingBox.height * 100}%`,
                }}>
                    <span className="absolute -top-6 left-0 bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">{component.name}</span>
                </div>
            ))}
        </div>

        {/* Header */}
        <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
          <div>
            <h2 id="ar-mode-title" className="text-lg font-bold text-yellow-300">{t('arModeTitle')}</h2>
            <p className="text-sm text-gray-300">{t('arModeDescription')}</p>
          </div>
          <button onClick={onClose} className="p-2 text-white rounded-full bg-black/30 hover:bg-black/60 transition-colors" aria-label={t('closeCamera')}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        
        {/* Status Overlay */}
        {(isInitializing || error) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/70">
                {isInitializing && <><SmallSpinner /> <p className="mt-2">{t('arInitializing')}</p></>}
                {error && <p className="text-red-400 text-center p-4">{error}</p>}
            </div>
        )}
      </div>
    </div>
  );
};

export default LiveArAnalysis;
