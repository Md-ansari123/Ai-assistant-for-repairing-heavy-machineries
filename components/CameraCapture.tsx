

import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: Aliased `Blob` from `@google/genai` to `GenaiBlob` to avoid conflict with the native `Blob` type.
import { GoogleGenAI, FunctionDeclaration, Type, Modality, LiveServerMessage, Blob as GenaiBlob } from "@google/genai";
import { useLanguage } from '../contexts/LanguageContext';
import { CloseIcon } from './icons/CloseIcon';
import { FlashOnIcon } from './icons/FlashOnIcon';
import { FlashOffIcon } from './icons/FlashOffIcon';
import { RetakeIcon } from './icons/RetakeIcon';
import { CheckIcon } from './icons/CheckIcon';
import { SmallSpinner } from './icons/SmallSpinner';
import type { ArComponent } from '../types';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { ZoomOutIcon } from './icons/ZoomOutIcon';


const FRAME_RATE = 10; // Send a frame every 1/10th of a second
const JPEG_QUALITY = 0.7;
const AUDIO_BUFFER_SIZE = 4096;

interface CameraCaptureProps {
  onCapture: (blob: Blob, type: 'image' | 'video') => void;
  onClose: () => void;
}

type Mode = 'ar' | 'image' | 'video';

// --- Encoding/Decoding Helpers ---
function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// FIX: Updated the return type to `GenaiBlob` to match the type expected by the Gemini API.
function createBlob(data: Float32Array): GenaiBlob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error("Failed to convert blob to base64 string."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
// --- End Encoding/Decoding Helpers ---

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


export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sessionPromiseRef = useRef<ReturnType<GoogleGenAI['live']['connect']> | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  
  const [mode, setMode] = useState<Mode>('image');
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  
  const [capturedMediaUrl, setCapturedMediaUrl] = useState<string | null>(null);
  
  const [isFlashSupported, setIsFlashSupported] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);

  // AR State
  const [detectedComponents, setDetectedComponents] = useState<ArComponent[]>([]);
  const [arError, setArError] = useState<string | null>(null);
  const [isArInitializing, setIsArInitializing] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});

  // Advanced Camera Controls State
  const [trackCapabilities, setTrackCapabilities] = useState<MediaTrackCapabilities | null>(null);
  const [zoom, setZoom] = useState(1);
  

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    setTrackCapabilities(null);
  }, []);

  const stopArSession = useCallback(() => {
    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
    }
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session?.close());
        sessionPromiseRef.current = null;
    }
    setDetectedComponents([]);
    setIsArInitializing(false);
  }, []);

  const startStream = useCallback(async () => {
    stopStream();
    setIsInitializing(true);
    setError(null);
    setArError(null);
    try {
        const constraints: MediaStreamConstraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: 'environment',
            },
            audio: true, 
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            const capabilities = videoTrack.getCapabilities();
            setTrackCapabilities(capabilities);
            // @ts-ignore
            setIsFlashSupported(!!capabilities.torch);
            
            // @ts-ignore
            if (capabilities.zoom) {
                // @ts-ignore
                setZoom(capabilities.zoom.min);
            }
        }

    } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError(t('cameraPermissionDeniedError'));
        } else {
            setError(t('cameraAccessError', { message: err.message }));
        }
        console.error("Camera access error:", err);
    } finally {
        setIsInitializing(false);
    }
  }, [stopStream, t]);

  const startArSession = useCallback(async () => {
    if (!streamRef.current || sessionPromiseRef.current) return;

    setIsArInitializing(true);
    setArError(null);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    if (!streamRef.current) return;
                    
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
                                if (blob && sessionPromiseRef.current) {
                                    const base64Data = await blobToBase64(blob);
                                    sessionPromiseRef.current?.then((session) => {
                                        session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
                                    });
                                }
                            },
                            'image/jpeg',
                            JPEG_QUALITY
                        );
                    }, 1000 / FRAME_RATE);

                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
                    const scriptProcessor = audioContextRef.current.createScriptProcessor(AUDIO_BUFFER_SIZE, 1, 1);

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };

                    source.connect(scriptProcessor);
                    scriptProcessor.connect(audioContextRef.current.destination);
                    scriptProcessorRef.current = scriptProcessor;
                },
                onmessage: (message: LiveServerMessage) => {
                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'reportVisibleComponents') {
                                setDetectedComponents(fc.args.components as ArComponent[]);
                                sessionPromiseRef.current?.then((session) => {
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
                    setArError(t('arConnectionError'));
                    stopArSession();
                },
                onclose: () => {
                    stopArSession();
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                tools: [{ functionDeclarations: [reportComponentsFunction] }],
                systemInstruction: `You are a master AI technician specializing in the analysis of heavy mining machinery. Your sole function is to analyze the incoming video frames with extreme precision. Your primary task is to identify and locate critical components relevant to mining equipment such as excavators, dump trucks, loaders, and drills. Focus on identifying specific parts like: hydraulic cylinders and hoses, engine blocks and manifolds, transmissions and gearboxes, undercarriage components (tracks, rollers, sprockets), buckets, booms, and arms, electrical control panels and wiring harnesses, filters (oil, fuel, air), and radiators and cooling systems. For each component you positively identify, you MUST immediately call the 'reportVisibleComponents' function. Provide the precise, tightest possible normalized bounding box for each component. Do not engage in conversation. Your output must only be function calls.`,
            },
        });
        await sessionPromiseRef.current;
    } catch(err) {
        console.error("Failed to start AR Session", err);
        setArError(t('arConnectionError'));
    } finally {
        setIsArInitializing(false);
    }
  }, [stopArSession, t]);

  useEffect(() => {
    startStream();
    return () => {
      stopStream();
      stopArSession();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  useEffect(() => {
    if (mode === 'ar' && !error && streamRef.current) {
        startArSession();
    } else {
        stopArSession();
    }
  }, [mode, error, startArSession, stopArSession]);

  const updateOverlayLayout = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    const videoAspectRatio = video.videoWidth / video.videoHeight;
    const containerWidth = video.clientWidth;
    const containerHeight = video.clientHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let renderedWidth = containerWidth;
    let renderedHeight = containerHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspectRatio > containerAspectRatio) {
      renderedHeight = containerWidth / videoAspectRatio;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      renderedWidth = containerHeight * videoAspectRatio;
      offsetX = (containerWidth - renderedWidth) / 2;
    }

    setOverlayStyle({
      position: 'absolute',
      width: `${renderedWidth}px`,
      height: `${renderedHeight}px`,
      left: `${offsetX}px`,
      top: `${offsetY}px`,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateOverlayLayout);
    const videoEl = videoRef.current;
    if (videoEl) {
        videoEl.addEventListener('loadedmetadata', updateOverlayLayout);
        videoEl.addEventListener('playing', updateOverlayLayout);
    }
    return () => {
        window.removeEventListener('resize', updateOverlayLayout);
        if (videoEl) {
            videoEl.removeEventListener('loadedmetadata', updateOverlayLayout);
            videoEl.removeEventListener('playing', updateOverlayLayout);
        }
    };
  }, [updateOverlayLayout]);
  
  const applyConstraint = useCallback(async (constraint: MediaTrackConstraints) => {
      if (!streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];
      try {
          await track.applyConstraints({ advanced: [constraint] });
      } catch (err) {
          console.error("Failed to apply constraint:", constraint, err);
      }
  }, []);

  const handleToggleFlash = useCallback(async () => {
    if (!isFlashSupported) return;
    const newFlashState = !isFlashOn;
    // @ts-ignore
    applyConstraint({ torch: newFlashState });
    setIsFlashOn(newFlashState);
  }, [isFlashSupported, isFlashOn, applyConstraint]);

  const handleZoomChange = (newZoom: number) => {
      if (!trackCapabilities || !('zoom' in trackCapabilities)) return;
      setZoom(newZoom);
      // @ts-ignore
      applyConstraint({ zoom: newZoom });
  };
  
  const handleCapturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (blob) {
          setCapturedMediaUrl(URL.createObjectURL(blob));
        }
      }, 'image/jpeg', 0.9);
    }
  }, []);

  const handleStartRecording = useCallback(() => {
    if (!streamRef.current) return;
    
    streamRef.current.getAudioTracks().forEach(track => track.enabled = true);

    try {
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };
      mediaRecorderRef.current.onstop = () => {
        if(streamRef.current) {
            streamRef.current.getAudioTracks().forEach(track => track.enabled = false);
        }
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("MediaRecorder error:", err);
      setError(t('videoRecordingError'));
    }
  }, [t]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      setCapturedMediaUrl(URL.createObjectURL(blob));
      setRecordedChunks([]);
    }
  }, [isRecording, recordedChunks]);

  const handleRetake = () => {
    if (capturedMediaUrl) {
      URL.revokeObjectURL(capturedMediaUrl);
      setCapturedMediaUrl(null);
    }
  };

  const handleUseMedia = async () => {
    if (capturedMediaUrl) {
      const response = await fetch(capturedMediaUrl);
      const blob = await response.blob();
      const mediaType = mode === 'video' ? 'video' : 'image';
      onCapture(blob, mediaType);
    }
  };

  const switchMode = (newMode: Mode) => {
    if (isRecording) handleStopRecording();
    setMode(newMode);
    if (isFlashOn) handleToggleFlash();
  };
  
  useEffect(() => {
    return () => {
      if (capturedMediaUrl) {
        URL.revokeObjectURL(capturedMediaUrl);
      }
    };
  }, [capturedMediaUrl]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="camera-capture-title">
        <h2 id="camera-capture-title" className="sr-only">{t('takePhoto')}</h2>
        
        <div className="relative w-full h-full flex items-center justify-center bg-black">
            {isInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/50 z-30">
                    <SmallSpinner />
                    <p className="mt-2">{t('startingCamera')}</p>
                </div>
            )}
            
            {(error) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-30">
                    <p className="text-red-400">{error}</p>
                    <p className="text-gray-400 mt-2 text-sm">{t('cameraTroubleshooting')}</p>
                </div>
            )}
            
            <div className={`w-full h-full transition-opacity duration-300 ${error ? 'opacity-0' : 'opacity-100'}`}>
                {capturedMediaUrl ? (
                    <div className="w-full h-full flex items-center justify-center">
                        {mode === 'image' ? (
                            <img src={capturedMediaUrl} alt={t('photoPreview')} className="max-w-full max-h-full object-contain" />
                        ) : (
                            <video src={capturedMediaUrl} controls autoPlay loop playsInline className="max-w-full max-h-full object-contain" />
                        )}
                    </div>
                ) : (
                    <>
                        <video 
                          ref={videoRef} 
                          autoPlay 
                          playsInline 
                          muted 
                          className="w-full h-full object-contain"
                          onLoadedData={() => {
                            if (videoRef.current) {
                                videoRef.current.play().catch(e => {
                                    console.error("Video play failed on onLoadedData:", e);
                                });
                                updateOverlayLayout();
                            }
                          }}
                        />
                        <div style={overlayStyle}>
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
                    </>
                )}
            </div>
             <canvas ref={canvasRef} className="hidden" />

            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-20">
                <div>
                    {isFlashSupported && !isRecording && !capturedMediaUrl && (
                        <button
                            onClick={handleToggleFlash}
                            className="p-2 text-white rounded-full bg-black/30 hover:bg-black/60"
                            title={isFlashOn ? t('turnFlashOff') : t('turnFlashOn')}
                        >
                            {isFlashOn ? <FlashOnIcon className="w-6 h-6"/> : <FlashOffIcon className="w-6 h-6"/>}
                        </button>
                    )}
                </div>
                <button onClick={onClose} className="p-2 text-white rounded-full bg-black/30 hover:bg-black/60 transition-colors" aria-label={t('closeCamera')} title={t('tooltipCloseCamera')}>
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>
            
            {(isArInitializing || arError) && mode === 'ar' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/70 pointer-events-none z-20">
                    {isArInitializing && <><SmallSpinner /> <p className="mt-2">{t('arInitializing')}</p></>}
                    {arError && <p className="text-red-400 text-center p-4">{arError}</p>}
                </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 pb-6 pt-12 flex flex-col items-center gap-4 bg-gradient-to-t from-black/70 to-transparent z-10">
                {capturedMediaUrl ? (
                    <div className="w-full flex justify-around items-center px-4">
                        <button onClick={handleRetake} className="flex flex-col items-center gap-1 text-white text-lg font-medium p-2" title={t('tooltipRetake')}>
                            <RetakeIcon className="w-8 h-8"/>
                        </button>
                        <button onClick={handleUseMedia} className="w-20 h-20 bg-white rounded-full flex items-center justify-center" title={t('tooltipUseMedia')}>
                            <CheckIcon className="w-12 h-12 text-black"/>
                        </button>
                        <div className="w-8 h-8"></div>
                    </div>
                ) : (
                    <>
                        {/* FIX: The 'zoom' property is non-standard and not in MediaTrackCapabilities. Cast to 'any' to prevent a TypeScript error. */}
                        {(trackCapabilities as any)?.zoom && (
                            <div className="w-full max-w-[280px] flex items-center gap-3 px-4 text-white">
                                <ZoomOutIcon className="w-6 h-6 text-gray-400"/>
                                <input
                                    type="range"
                                    // @ts-ignore
                                    min={trackCapabilities.zoom.min}
                                    // @ts-ignore
                                    max={trackCapabilities.zoom.max}
                                    // @ts-ignore
                                    step={trackCapabilities.zoom.step}
                                    value={zoom}
                                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full"
                                    disabled={isRecording}
                                    aria-label="Zoom control"
                                />
                                 <ZoomInIcon className="w-6 h-6 text-gray-400" />
                            </div>
                        )}
                        <div className="flex items-center justify-center gap-6 text-white text-base font-semibold mt-4">
                           <button onClick={() => switchMode('ar')} className={`px-3 py-1.5 transition-colors ${mode !== 'ar' && 'opacity-70'}`}>{t('arMode')}</button>
                           <button onClick={() => switchMode('image')} className={`px-4 py-2 rounded-full transition-all duration-200 ${mode === 'image' ? 'bg-yellow-400 text-black' : ''}`}>{t('photoMode')}</button>
                           <button onClick={() => switchMode('video')} className={`px-3 py-1.5 transition-colors ${mode !== 'video' && 'opacity-70'}`}>{t('videoMode')}</button>
                       </div>

                       <div className="h-24 flex items-center justify-center mt-2">
                           <button 
                               onClick={mode === 'image' ? handleCapturePhoto : (isRecording ? handleStopRecording : handleStartRecording)} 
                               className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center transition-transform duration-200 active:scale-90 disabled:opacity-50"
                               aria-label={mode === 'image' ? t('tooltipCapture') : (isRecording ? t('tooltipStopRecording') : t('tooltipStartRecording'))}
                               title={mode === 'image' ? t('tooltipCapture') : (isRecording ? t('tooltipStopRecording') : t('tooltipStartRecording'))}
                               disabled={mode === 'ar'}
                           >
                               {isRecording ? (
                                   <div className="w-8 h-8 bg-red-500 rounded-md animate-pulse"></div>
                               ) : (
                                   <div className="w-[60px] h-[60px] bg-white rounded-full"></div>
                               )}
                           </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    </div>
  );
};
