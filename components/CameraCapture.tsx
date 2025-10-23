import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: Aliased `Blob` from `@google/genai` to `GenaiBlob` to avoid conflict with the native `Blob` type.
import { GoogleGenAI, FunctionDeclaration, Type, Modality, LiveServerMessage, Blob as GenaiBlob } from "@google/genai";
import { useLanguage } from '../contexts/LanguageContext';
import { CloseIcon } from './icons/CloseIcon';
import { CameraIcon } from './icons/CameraIcon';
import { VideoIcon } from './icons/VideoIcon';
import { FlashOnIcon } from './icons/FlashOnIcon';
import { FlashOffIcon } from './icons/FlashOffIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import { RetakeIcon } from './icons/RetakeIcon';
import { CheckIcon } from './icons/CheckIcon';
import { StopIcon } from './icons/StopIcon';
import { SmallSpinner } from './icons/SmallSpinner';
import type { ArComponent } from '../types';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { ZoomOutIcon } from './icons/ZoomOutIcon';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';

const FRAME_RATE = 10; // Send a frame every 1/10th of a second
const JPEG_QUALITY = 0.7;
const AUDIO_BUFFER_SIZE = 4096;

interface CameraCaptureProps {
  onCapture: (blob: Blob, type: 'image' | 'video') => void;
  onClose: () => void;
}

type Mode = 'ar' | 'image' | 'video';
type Quality = '480p' | '720p' | '1080p';

const qualityConstraints: Record<Quality, MediaTrackConstraints> = {
  '480p': { width: { ideal: 640 }, height: { ideal: 480 } },
  '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
  '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
};

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
  
  const [mode, setMode] = useState<Mode>('ar');
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  
  const [capturedMediaUrl, setCapturedMediaUrl] = useState<string | null>(null);
  
  const [isFlashSupported, setIsFlashSupported] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [quality, setQuality] = useState<Quality>('1080p');

  // AR State
  const [detectedComponents, setDetectedComponents] = useState<ArComponent[]>([]);
  const [arError, setArError] = useState<string | null>(null);
  const [isArInitializing, setIsArInitializing] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});

  // Advanced Camera Controls State
  const [trackCapabilities, setTrackCapabilities] = useState<MediaTrackCapabilities | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [tilt, setTilt] = useState(0);

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

  const startStream = useCallback(async (deviceId?: string) => {
    stopStream();
    setIsInitializing(true);
    setError(null);
    setArError(null);
    try {
        const constraints: MediaStreamConstraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                ...qualityConstraints[quality],
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
            
            const settings = videoTrack.getSettings();
            // @ts-ignore
            if (settings.zoom) setZoom(settings.zoom);
             // @ts-ignore
            if (settings.pan) setPan(settings.pan);
             // @ts-ignore
            if (settings.tilt) setTilt(settings.tilt);
        }

        const availableDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(availableDevices.filter(d => d.kind === 'videoinput'));
        if (!deviceId) {
            setSelectedDeviceId(videoTrack.getSettings().deviceId);
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
  }, [stopStream, quality, t]);

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
                    
                    // Video Streaming Setup
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

                    // Audio Streaming Setup
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
    }
    return () => {
        window.removeEventListener('resize', updateOverlayLayout);
        if (videoEl) {
            videoEl.removeEventListener('loadedmetadata', updateOverlayLayout);
        }
    };
  }, [updateOverlayLayout]);


  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    startStream(deviceId);
  };
  
  const handleQualityChange = (newQuality: Quality) => {
    setQuality(newQuality);
    startStream(selectedDeviceId);
  };
  
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
      setZoom(newZoom);
      // @ts-ignore
      applyConstraint({ zoom: newZoom });
  };
  
  const handlePanChange = (direction: 'left' | 'right') => {
      // @ts-ignore
      if (!trackCapabilities?.pan) return;
      // @ts-ignore
      const { min, max, step } = trackCapabilities.pan;
      let newPan = pan;
      if (direction === 'left') {
          newPan = Math.max(min, pan - step);
      } else {
          newPan = Math.min(max, pan + step);
      }
      setPan(newPan);
      // @ts-ignore
      applyConstraint({ pan: newPan });
  };
  
  const handleTiltChange = (direction: 'up' | 'down') => {
      // @ts-ignore
      if (!trackCapabilities?.tilt) return;
      // @ts-ignore
      const { min, max, step } = trackCapabilities.tilt;
      let newTilt = tilt;
      if (direction === 'up') {
          newTilt = Math.max(min, tilt - step);
      } else {
          newTilt = Math.min(max, tilt + step);
      }
      setTilt(newTilt);
      // @ts-ignore
      applyConstraint({ tilt: newTilt });
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
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="camera-capture-title">
        <h2 id="camera-capture-title" className="sr-only">{t('takePhoto')}</h2>
        
        <div className="relative w-full h-full flex items-center justify-center bg-black">
            {isInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/50">
                    <SmallSpinner />
                    <p className="mt-2">{t('startingCamera')}</p>
                </div>
            )}
            
            {(error) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
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
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
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

            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                <button 
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                  className="p-2 text-white rounded-full bg-black/30 hover:bg-black/60 transition-colors" 
                  aria-label={t('cameraSettings')} 
                  title={t('tooltipSettings')}
                  disabled={isRecording || !!capturedMediaUrl}
                >
                    <SettingsIcon className="w-6 h-6" />
                </button>
                <button onClick={onClose} className="p-2 text-white rounded-full bg-black/30 hover:bg-black/60 transition-colors" aria-label={t('closeCamera')} title={t('tooltipCloseCamera')}>
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>
            
            {isSettingsOpen && (
                <div className="absolute top-16 left-4 bg-gray-800/80 backdrop-blur-sm p-4 rounded-lg border border-gray-600 shadow-lg text-white z-20">
                    <div className="mb-3">
                        <label htmlFor="camera-select" className="block text-sm font-medium mb-1">{t('camera')}</label>
                        <select id="camera-select" value={selectedDeviceId} onChange={e => handleDeviceChange(e.target.value)} className="w-full bg-gray-700 border border-gray-500 rounded-md p-1.5 text-sm">
                            {devices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${devices.indexOf(device) + 1}`}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('cameraQuality')}</label>
                        <div className="flex gap-2">
                           {(['480p', '720p', '1080p'] as Quality[]).map(q => (
                                <button key={q} onClick={() => handleQualityChange(q)} className={`px-2 py-1 text-xs rounded-md ${quality === q ? 'bg-yellow-500 text-black' : 'bg-gray-600 hover:bg-gray-500'}`}>{t(`quality${q}`)}</button>
                           ))}
                        </div>
                    </div>
                </div>
            )}

            {!capturedMediaUrl && !error && !isInitializing && (
              <>
                {/* Desktop Controls (Right side) */}
                <div className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col items-center gap-4 bg-black/40 p-3 rounded-full z-10">
                    {isFlashSupported && mode !== 'ar' && (
                        <button
                            onClick={handleToggleFlash}
                            disabled={isRecording}
                            className="p-2 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50 transition-colors"
                            title={isFlashOn ? t('turnFlashOff') : t('turnFlashOn')}
                        >
                            {isFlashOn ? <FlashOnIcon className="w-6 h-6"/> : <FlashOffIcon className="w-6 h-6"/>}
                        </button>
                    )}
                    
                    {/* @ts-ignore */}
                    {trackCapabilities?.zoom && (
                        <div className="flex flex-col items-center gap-2 text-white h-32 justify-center">
                            <button
                                // @ts-ignore
                                onClick={() => handleZoomChange(Math.min(trackCapabilities.zoom.max, zoom + trackCapabilities.zoom.step))}
                                // @ts-ignore
                                disabled={zoom >= trackCapabilities.zoom.max || isRecording}
                                className="p-1 rounded-full enabled:hover:bg-black/60 disabled:opacity-50"
                                title={t('tooltipZoomIn')}
                            >
                                <ZoomInIcon className="w-5 h-5" />
                            </button>
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
                                className="w-20 h-1 appearance-none bg-gray-600 rounded-full cursor-pointer"
                                style={{ transform: 'rotate(-90deg)' }}
                                disabled={isRecording}
                            />
                            <button
                                // @ts-ignore
                                onClick={() => handleZoomChange(Math.max(trackCapabilities.zoom.min, zoom - trackCapabilities.zoom.step))}
                                // @ts-ignore
                                disabled={zoom <= trackCapabilities.zoom.min || isRecording}
                                className="p-1 rounded-full enabled:hover:bg-black/60 disabled:opacity-50"
                                title={t('tooltipZoomOut')}
                            >
                                <ZoomOutIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    
                    {/* @ts-ignore */}
                    {trackCapabilities?.pan && trackCapabilities?.tilt && (
                        <div className="relative w-20 h-20">
                            <button onClick={() => handleTiltChange('up')} className="absolute top-0 left-1/2 -translate-x-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanUp')}><ArrowUpIcon className="w-6 h-6" /></button>
                            <button onClick={() => handleTiltChange('down')} className="absolute bottom-0 left-1/2 -translate-x-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanDown')}><ArrowDownIcon className="w-6 h-6" /></button>
                            <button onClick={() => handlePanChange('left')} className="absolute left-0 top-1/2 -translate-y-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanLeft')}><ArrowLeftIcon className="w-6 h-6" /></button>
                            <button onClick={() => handlePanChange('right')} className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanRight')}><ArrowRightIcon className="w-6 h-6" /></button>
                        </div>
                    )}
                </div>

                {/* Mobile Controls (Bottom) */}
                <div className="absolute bottom-28 inset-x-4 flex sm:hidden items-center justify-around gap-2 bg-black/40 px-3 py-2 rounded-xl z-10">
                    {isFlashSupported && mode !== 'ar' && (
                        <button
                            onClick={handleToggleFlash}
                            disabled={isRecording}
                            className="p-2 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50"
                            title={isFlashOn ? t('turnFlashOff') : t('turnFlashOn')}
                        >
                            {isFlashOn ? <FlashOnIcon className="w-6 h-6"/> : <FlashOffIcon className="w-6 h-6"/>}
                        </button>
                    )}
                    
                    {/* @ts-ignore */}
                    {trackCapabilities?.zoom && (
                        <div className="flex items-center gap-1 text-white">
                            <button
                                // @ts-ignore
                                onClick={() => handleZoomChange(Math.max(trackCapabilities.zoom.min, zoom - trackCapabilities.zoom.step))}
                                // @ts-ignore
                                disabled={zoom <= trackCapabilities.zoom.min || isRecording}
                                className="p-1 rounded-full enabled:hover:bg-black/60 disabled:opacity-50"
                                title={t('tooltipZoomOut')}
                            >
                                <ZoomOutIcon className="w-5 h-5" />
                            </button>
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
                                className="w-20 h-1 appearance-none bg-gray-600 rounded-full cursor-pointer"
                                disabled={isRecording}
                            />
                            <button
                                // @ts-ignore
                                onClick={() => handleZoomChange(Math.min(trackCapabilities.zoom.max, zoom + trackCapabilities.zoom.step))}
                                // @ts-ignore
                                disabled={zoom >= trackCapabilities.zoom.max || isRecording}
                                className="p-1 rounded-full enabled:hover:bg-black/60 disabled:opacity-50"
                                title={t('tooltipZoomIn')}
                            >
                                <ZoomInIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    
                    {/* @ts-ignore */}
                    {trackCapabilities?.pan && trackCapabilities?.tilt && (
                        <div className="relative w-16 h-16">
                            <button onClick={() => handleTiltChange('up')} className="absolute top-0 left-1/2 -translate-x-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanUp')}><ArrowUpIcon className="w-5 h-5" /></button>
                            <button onClick={() => handleTiltChange('down')} className="absolute bottom-0 left-1/2 -translate-x-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanDown')}><ArrowDownIcon className="w-5 h-5" /></button>
                            <button onClick={() => handlePanChange('left')} className="absolute left-0 top-1/2 -translate-y-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanLeft')}><ArrowLeftIcon className="w-5 h-5" /></button>
                            <button onClick={() => handlePanChange('right')} className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-white rounded-full enabled:hover:bg-black/60 disabled:opacity-50" disabled={isRecording} title={t('tooltipPanRight')}><ArrowRightIcon className="w-5 h-5" /></button>
                        </div>
                    )}
                </div>
              </>
            )}
            
            {(isArInitializing || arError) && mode === 'ar' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/70 pointer-events-none">
                    {isArInitializing && <><SmallSpinner /> <p className="mt-2">{t('arInitializing')}</p></>}
                    {arError && <p className="text-red-400 text-center p-4">{arError}</p>}
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center gap-4 bg-gradient-to-t from-black/70 to-transparent">
                {!capturedMediaUrl && (
                  <div className="flex items-center gap-2 bg-black/40 p-1 rounded-full text-sm font-semibold">
                      <button onClick={() => switchMode('ar')} className={`px-4 py-1.5 rounded-full transition-colors ${mode === 'ar' ? 'bg-yellow-400 text-black' : 'text-white'}`} disabled={isRecording}>{t('arMode')}</button>
                      <button onClick={() => switchMode('image')} className={`px-4 py-1.5 rounded-full transition-colors ${mode === 'image' ? 'bg-yellow-400 text-black' : 'text-white'}`} disabled={isRecording}>{t('photoMode')}</button>
                      <button onClick={() => switchMode('video')} className={`px-4 py-1.5 rounded-full transition-colors ${mode === 'video' ? 'bg-yellow-400 text-black' : 'text-white'}`} disabled={isRecording}>{t('videoMode')}</button>
                  </div>
                )}
                
                <div className="w-full flex justify-around items-center min-h-[80px]">
                    {capturedMediaUrl ? (
                         <>
                            <button onClick={handleRetake} className="flex flex-col items-center gap-1 text-white text-sm font-medium" title={t('tooltipRetake')}>
                                <div className="w-16 h-16 rounded-full bg-gray-600/50 flex items-center justify-center hover:bg-gray-500/50 transition-colors"><RetakeIcon className="w-8 h-8"/></div>
                                {t('retake')}
                            </button>
                            <button onClick={handleUseMedia} className="flex flex-col items-center gap-1 text-white text-sm font-medium" title={t('tooltipUseMedia')}>
                                <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors"><CheckIcon className="w-10 h-10"/></div>
                                {t('useMedia')}
                            </button>
                        </>
                    ) : (
                         <>
                            <div className="w-16 h-16"></div>
                            
                            {mode === 'ar' ? (
                                isFlashSupported && (
                                    <button 
                                        onClick={handleToggleFlash}
                                        className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-colors ${isFlashOn ? 'border-yellow-400 bg-yellow-400/30' : 'border-white bg-white/30'}`}
                                        aria-label={isFlashOn ? t('turnFlashOff') : t('turnFlashOn')}
                                        title={isFlashOn ? t('turnFlashOff') : t('turnFlashOn')}
                                    >
                                        {isFlashOn ? <FlashOnIcon className="w-10 h-10 text-yellow-400"/> : <FlashOffIcon className="w-10 h-10 text-white"/>}
                                    </button>
                                )
                            ) : (
                                <button 
                                    onClick={mode === 'image' ? handleCapturePhoto : (isRecording ? handleStopRecording : handleStartRecording)} 
                                    className="w-20 h-20 rounded-full border-4 border-white bg-white/30 flex items-center justify-center"
                                    aria-label={mode === 'image' ? t('tooltipCapture') : (isRecording ? t('tooltipStopRecording') : t('tooltipStartRecording'))}
                                    title={mode === 'image' ? t('tooltipCapture') : (isRecording ? t('tooltipStopRecording') : t('tooltipStartRecording'))}
                                >
                                    {isRecording ? (
                                        <StopIcon className="w-8 h-8 text-red-500 animate-pulse" />
                                    ) : (
                                        <div className={`w-18 h-18 rounded-full ${mode === 'image' ? 'bg-white' : 'bg-red-500'} transition-colors`}></div>
                                    )}
                                </button>
                            )}
                            
                            <div className="w-16 h-16"></div>
                        </>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};