

import { GoogleGenAI, Type, Chat, Modality } from "@google/genai";

// --- GLOBAL STATE & APP LOGIC ---
const HISTORY_STORAGE_KEY = 'repairHistory';
const DRAFT_STORAGE_KEY = 'problemDescriptionDraft';
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES];


let state = {
  // Core state
  isLoading: false,
  isTranslating: false,
  error: null,
  
  // Guide state
  repairGuide: null,
  translatedGuide: null,
  mediaFile: null,
  mediaPreviewUrl: null,

  // Chat state
  chatSession: null,
  isChatOpen: false,
  isChatLoading: false,
  chatMessages: [],

  // History state
  isHistoryOpen: false,
  history: [],
  
  // UI state
  language: 'en',
  isListening: false,
  isCameraOpen: false,
  
  // Interactive Guide state
  activeStepIndex: null,
  isEditingAnnotations: false,
};

let translations = {};
const languages = {
    en: { code: 'en', name: 'English' },
    en_in: { code: 'en_in', name: 'Hinglish' },
    hi: { code: 'hi', name: 'हिन्दी (Hindi)' },
    bn: { code: 'bn', name: 'বাংলা (Bengali)' },
    te: { code: 'te', name: 'తెలుగు (Telugu)' },
    ta: { code: 'ta', name: 'தமிழ் (Tamil)' },
    kn: { code: 'kn', name: 'ಕನ್ನಡ (Kannada)' },
    ur: { code: 'ur', name: 'اردو (Urdu)' },
    mr: { code: 'mr', name: 'मराठी (Marathi)' },
    gu: { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
};

// --- STATE MANAGEMENT ---
const subscribers = new Set();
const setState = (update) => {
  const oldState = { ...state };
  const newState = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...newState };
  subscribers.forEach(callback => callback(state, oldState));
};
const subscribe = (callback) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

// --- DOM SELECTORS ---
const D = document;
const get = (id) => D.getElementById(id);

const dom = {
  loadingOverlay: get('loading-overlay'),
  header: {
    logo: get('header-logo'),
    historyButtonIcon: get('history-button-icon'),
    translateIcon: get('translate-icon'),
    languageSelect: get('language-select'),
    translatingIndicator: get('translating-indicator'),
  },
  form: {
    form: get('problem-form'),
    description: get('problem-description'),
    descriptionError: get('description-error'),
    listeningIndicator: get('listening-indicator'),
    micIcon: get('mic-icon'),
    speechToTextButton: get('speech-to-text-button'),
    mediaPreviewContainer: get('media-preview-container'),
    dropZone: get('drop-zone'),
    fileUpload: get('file-upload'),
    fileTypesInfo: get('file-types-info'),
    mediaError: get('media-error'),
    cameraButton: get('camera-button'),
    cameraIcon: get('camera-icon'),
    submitButton: get('submit-button'),
  },
  errorDisplay: get('error-display'),
  loadingSpinner: get('loading-spinner'),
  repairGuideContainer: get('repair-guide-container'),
  chat: {
    button: get('chat-button'),
    buttonIcon: get('chat-button-icon'),
    widget: get('chatbot-widget'),
    headerIcon: get('chatbot-header-icon'),
    closeButton: get('chatbot-close-button'),
    closeIcon: get('chatbot-close-icon'),
    messages: get('chatbot-messages'),
    form: get('chatbot-form'),
    input: get('chatbot-input'),
    sendButton: get('chatbot-send-button'),
    sendIcon: get('chatbot-send-icon'),
  },
  history: {
    panel: get('history-panel'),
    headerIcon: get('history-header-icon'),
    closeButton: get('history-close-button'),
    closeIcon: get('history-close-icon'),
    list: get('history-list'),
    footer: get('history-footer'),
    clearConfirm: get('clear-history-confirm'),
    clearCancelButton: get('clear-history-cancel-button'),
    clearConfirmButton: get('clear-history-confirm-button'),
    clearButton: get('clear-history-button'),
    clearIcon: get('clear-history-icon'),
  },
  cameraModal: get('camera-modal'),
};

// --- ICONS ---
const ICONS = {
    MiningTruck: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21.92,13.2a2.5,2.5,0,0,0-2.09-1.2H17.5V9.5a2.5,2.5,0,0,0-2.5-2.5H4.27L3.33,4.5A2.5,2.5,0,0,0,.92,3H0V5H.92a.5.5,0,0,1,.49.4l2,7.27V19.5a2.5,2.5,0,0,0,2.5,2.5h.5a2.5,2.5,0,0,0,2.5-2.5v-.5h6v.5a2.5,2.5,0,0,0,2.5,2.5h.5a2.5,2.5,0,0,0,2.5-2.5V15.5a2.5,2.5,0,0,0-.42-1.39ZM8,19.5a.5.5,0,0,1-.5.5H7a.5.5,0,0,1-.5-.5V18.27l1.33.44a.51.51,0,0,0,.67-.34V19.5ZM5.83,16,3.5,15.2V13h2.75l-.42,1.5ZM15.5,13H5.73L4,7h11ZM18,19.5a.5.5,0,0,1-.5.5h-.5a.5.5,0,0,1-.5-.5V18.37a.51.51,0,0,0-.67-.34l-1.33.44V17.5a.5.5,0,0,1,.5-.5h2.5v2.5ZM22,15.5a.5.5,0,0,1-.5.5H16V13h3.83l.59-2.17.47.13a.5.5,0,0,1,.41.57Z"/></svg>`,
    History: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    Translate: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" /></svg>`,
    Camera: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.75v9.75c0 1.243.75 2.17 1.799 2.332.377.063.754.12 1.134.175a2.31 2.31 0 011.64 1.055l.822 1.315a2.25 2.25 0 001.905 1.055h5.158a2.25 2.25 0 001.905-1.055l.822-1.315a2.31 2.31 0 011.64-1.055.75.75 0 00.416-.223 2.31 2.31 0 011.134-.175c1.049-.163 1.799-1.09 1.799-2.332V9.75c0-1.243-.75-2.17-1.799-2.332a2.31 2.31 0 01-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.315a2.25 2.25 0 00-1.905-1.055H8.73c-.832 0-1.612.445-1.905 1.055l-.822 1.315z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
    Microphone: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 016 0v8.25a3 3 0 01-3 3z" /></svg>`,
    Chat: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>`,
    Close: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
    Send: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>`,
    Trash: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`,
    Cost: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 100-6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    Availability: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>`,
    Tool: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.17 48.17 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>`,
    Warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`,
    Step: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5m3-15-3 3m0 0-3-3m3 3V15" /></svg>`,
    Materials: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h.01M15 12h.01M10.5 16.5h3m-6.38-3.38l-1.42-1.42A9 9 0 1121.7 18.3l-1.42-1.42m-10.62 0a3 3 0 00-4.24 0l-1.42 1.42a3 3 0 000 4.24l1.42 1.42a3 3 0 004.24 0l1.42-1.42a3 3 0 000-4.24zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
    Preventative: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Z" /></svg>`,
    MachineDowntime: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
    ManualLabor: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`,
    Export: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>`,
    ThumbsUp: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.25a2.25 2.25 0 01-2.25-2.25v-2.5a2.25 2.25 0 012.25-2.25h1.383z" /></svg>`,
    ThumbsDown: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.588 8.26l-1.064.424-1.063-.424a11.952 11.952 0 00-5.529-1.546A5.25 5.25 0 008.25 15a5.25 5.25 0 00-1.737 1.311l-1.588.635-1.588-.635a5.25 5.25 0 00-1.737-1.311A5.25 5.25 0 00.5 15c0-2.64.936-5.04 2.55-6.882A7.5 7.5 0 017.864 4.243z" /></svg>`,
    Edit: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>`,
    FlashOn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2L3 12h5v10l7-10h-5L10 2z" /></svg>`,
    FlashOff: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`,
    Retake: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.18-3.185m-3.18-3.182V6.375a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>`,
    Check: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`,
    ZoomIn: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>`,
    ZoomOut: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" /></svg>`,
    Spinner: `<svg class="animate-spin h-10 w-10 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
    SmallSpinner: `<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
};

// --- TRANSLATION (i18n) ---
async function loadTranslations() {
  try {
    const responses = await Promise.all(
      Object.keys(languages).map(code => fetch(`./translations/${code}.json`))
    );
    for (const res of responses) {
      if (!res.ok) throw new Error(`Failed to fetch ${res.url}`);
    }
    const jsonData = await Promise.all(responses.map(res => res.json()));
    const newTranslations = {};
    Object.keys(languages).forEach((code, index) => {
      newTranslations[code] = jsonData[index];
    });
    translations = newTranslations;
  } catch (error) {
    console.error("Failed to load translations:", error);
    if (!translations.en) {
      try {
        const enRes = await fetch('./translations/en.json');
        translations.en = await enRes.json();
      } catch (e) { console.error("Failed to load fallback English translation", e); }
    }
  }
}

function t(key, replacements = {}) {
    const currentLangTranslations = translations[state.language];
    const englishTranslations = translations['en'];
    let translation = currentLangTranslations?.[key] || englishTranslations?.[key] || key;
    Object.entries(replacements).forEach(([rKey, value]) => {
        translation = translation.replace(new RegExp(`{{${rKey}}}`, 'g'), String(value));
    });
    return translation;
}

function updateUIText() {
    D.querySelectorAll('[data-t]').forEach(el => {
        const key = el.dataset.t;
        const text = t(key);
        if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });
    dom.form.fileTypesInfo.textContent = t('fileTypesVideo', { size: MAX_FILE_SIZE_MB });
    dom.form.description.placeholder = t('describeIssuePlaceholder');
    dom.chat.input.placeholder = t('chatPlaceholder');
}

// --- HISTORY MANAGEMENT ---
const getHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
  } catch (e) { return []; }
};
const saveHistory = (history) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) { console.error("Failed to save history", e); }
};
const addToHistory = (description, guide, mediaFile) => {
  const currentHistory = getHistory();
  const newItem = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    description,
    guide,
    mediaFile: mediaFile ? { name: mediaFile.name, type: mediaFile.type } : null
  };
  const newHistory = [newItem, ...currentHistory].slice(0, 50);
  saveHistory(newHistory);
  // We don't save the actual file blob in history, just a reference.
  // The mediaPreviewUrl is transient. We will handle re-creating it if needed.
  return newHistory;
};
const deleteFromHistory = (id) => {
  const newHistory = getHistory().filter(item => item.id !== id);
  saveHistory(newHistory);
  return newHistory;
};
const clearHistory = () => {
  saveHistory([]);
  return [];
};

// --- GEMINI API SERVICE ---
const fileToGenerativePart = async (file) => {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } };
};

const repairGuideSchema = {
    type: Type.OBJECT,
    properties: {
        diagnosis: { type: Type.STRING, description: "A concise diagnosis." },
        estimatedCost: { type: Type.STRING, description: "Estimated cost range." },
        machineDowntime: { type: Type.STRING, description: "Total time machine is non-operational." },
        manualLaborTime: { type: Type.STRING, description: "Hands-on work time." },
        partAvailability: { type: Type.STRING, description: "Availability of parts." },
        requiredTools: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of tools." },
        requiredMaterials: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of materials." },
        safetyWarnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Critical safety warnings." },
        repairSteps: {
            type: Type.ARRAY, items: {
                type: Type.OBJECT, properties: {
                    description: { type: Type.STRING, description: "A single repair step." },
                    boundingBox: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, width: { type: Type.NUMBER }, height: { type: Type.NUMBER } } }
                }, required: ['description']
            }, description: "Step-by-step guide."
        },
        preventativeMaintenance: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Preventative tips." }
    },
    required: ['diagnosis', 'estimatedCost', 'machineDowntime', 'manualLaborTime', 'partAvailability', 'requiredTools', 'requiredMaterials', 'safetyWarnings', 'repairSteps', 'preventativeMaintenance']
};

const generateRepairGuide = async (problemDescription, mediaFile) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const systemInstruction = `You are an expert AI mechanic for the Jharkhand Mining Division. Provide a detailed repair guide. You MUST provide two separate time estimates: 'machineDowntime' (total out-of-service time) and 'manualLaborTime' (hands-on work time), ensuring 'manualLaborTime' <= 'machineDowntime'. Include preventative maintenance tips. Be professional, clear, and prioritize safety. Do not process PII. List specific materials like 'cotton tape, Mica tape' for motors, or 'contactors, timers' for panels. If an image is provided, you MUST include a normalized 'boundingBox' for each relevant repair step; otherwise, omit it. Respond in JSON format according to the schema.`;
    const contents = [{ text: `Problem: ${problemDescription}` }];
    if (mediaFile) {
        contents.unshift(await fileToGenerativePart(mediaFile));
    }
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: contents },
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: repairGuideSchema, temperature: 0.2, thinkingConfig: { thinkingBudget: 32768 } }
    });
    try {
        return JSON.parse(response.text.trim());
    } catch (e) {
        console.error("Failed to parse JSON response:", response.text);
        throw new Error("The AI returned an invalid response format.");
    }
};

const createChatSession = (initialContext) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: `You are an AI assistant for a heavy machinery technician. The initial problem: "${initialContext}". Answer follow-up questions concisely. Do not ask for or process any PII.` }
    });
};

const sendChatMessage = async (chat, message) => (await chat.sendMessage({ message })).text;

const translationArraySchema = {
    type: Type.OBJECT,
    properties: { translations: { type: Type.ARRAY, items: { type: Type.STRING } } },
    required: ['translations'],
};
const translateRepairGuide = async (guide, targetLanguage) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const stringsToTranslate = [
        guide.diagnosis, guide.estimatedCost, guide.machineDowntime, guide.manualLaborTime, guide.partAvailability,
        ...guide.requiredTools, ...(guide.requiredMaterials || []), ...guide.safetyWarnings,
        ...guide.repairSteps.map(step => step.description), ...(guide.preventativeMaintenance || []),
    ];
    const prompt = `You are an expert technical translator. Translate the following JSON array of strings into ${targetLanguage}. Return a JSON object with a single key "translations", an array of strings, in the exact same order as the input. Input: ${JSON.stringify(stringsToTranslate)}`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: prompt,
        config: { temperature: 0.1, responseMimeType: "application/json", responseSchema: translationArraySchema, }
    });
    try {
        const { translations: translatedStrings } = JSON.parse(response.text.trim());
        if (translatedStrings.length !== stringsToTranslate.length) throw new Error("Translation length mismatch.");
        let i = 0;
        const n = (arr) => translatedStrings.slice(i, i += arr.length);
        const translatedGuide = {
            diagnosis: translatedStrings[i++], estimatedCost: translatedStrings[i++], machineDowntime: translatedStrings[i++], manualLaborTime: translatedStrings[i++], partAvailability: translatedStrings[i++],
            requiredTools: n(guide.requiredTools),
            requiredMaterials: guide.requiredMaterials ? n(guide.requiredMaterials) : [],
            safetyWarnings: n(guide.safetyWarnings),
            repairSteps: guide.repairSteps.map((step, idx) => ({ ...step, description: translatedStrings[i + idx] })),
        };
        i += guide.repairSteps.length;
        translatedGuide.preventativeMaintenance = guide.preventativeMaintenance ? n(guide.preventativeMaintenance) : [];
        return translatedGuide;
    } catch (e) {
        console.error("Failed to parse translated JSON:", response.text, e);
        throw new Error("The AI returned an invalid translation format.");
    }
};

// --- RENDER FUNCTIONS ---
function render(s, oldState = {}) {
    // Header
    dom.header.translatingIndicator.style.display = s.isTranslating ? 'block' : 'none';
    dom.header.languageSelect.disabled = s.isTranslating;
    if (s.language !== oldState.language) dom.header.languageSelect.value = s.language;

    // Form
    const formDisabled = s.isLoading;
    dom.form.description.disabled = formDisabled;
    dom.form.fileUpload.disabled = formDisabled;
    dom.form.cameraButton.disabled = formDisabled;
    dom.form.submitButton.disabled = formDisabled;
    dom.form.speechToTextButton.disabled = formDisabled;
    dom.form.dropZone.classList.toggle('cursor-not-allowed', formDisabled);
    dom.form.dropZone.classList.toggle('bg-gray-800/50', !formDisabled);
    dom.form.dropZone.classList.toggle('bg-gray-800', formDisabled);
    dom.form.submitButton.firstElementChild.textContent = s.isLoading ? t('generatingGuide') : t('getRepairGuide');

    // Error
    dom.errorDisplay.textContent = s.error ? `${t('errorLabel')}: ${s.error}` : '';
    dom.errorDisplay.classList.toggle('hidden', !s.error);
    
    // Loading Spinner
    dom.loadingSpinner.classList.toggle('hidden', !s.isLoading);
    if(s.isLoading) dom.loadingSpinner.innerHTML = ICONS.Spinner + `<p class="mt-4 text-lg text-yellow-400">${t('analyzingProblem')}</p>`;
    
    // Repair Guide
    if(s.repairGuide !== oldState.repairGuide || s.translatedGuide !== oldState.translatedGuide || s.activeStepIndex !== oldState.activeStepIndex || s.isEditingAnnotations !== oldState.isEditingAnnotations) {
        renderRepairGuide();
    }
    
    // Media Preview
    if(s.mediaPreviewUrl !== oldState.mediaPreviewUrl) {
      renderMediaPreview();
    }

    // Chat
    dom.chat.button.classList.toggle('hidden', !s.chatSession);
    dom.chat.widget.classList.toggle('hidden', !s.isChatOpen);
    if(s.isChatOpen) renderChatMessages();
    dom.chat.input.disabled = s.isChatLoading;
    dom.chat.sendButton.disabled = s.isChatLoading || !dom.chat.input.value.trim();

    // History
    dom.history.panel.classList.toggle('hidden', !s.isHistoryOpen);
    if(s.isHistoryOpen) renderHistoryList();
    
    // Speech to text
    dom.form.listeningIndicator.classList.toggle('hidden', !s.isListening);
    dom.form.speechToTextButton.classList.toggle('bg-red-500', s.isListening);
    dom.form.speechToTextButton.classList.toggle('animate-pulse', s.isListening);

    // Camera Modal
    if(s.isCameraOpen && !oldState.isCameraOpen) openCameraModal();
    if(!s.isCameraOpen && oldState.isCameraOpen) closeCameraModal();
}

function renderMediaPreview() {
  const { mediaFile, mediaPreviewUrl } = state;
  if (mediaPreviewUrl) {
      const type = mediaFile.type.startsWith('image/') ? 'image' : 'video';
      const mediaEl = type === 'image' 
          ? `<img src="${mediaPreviewUrl}" alt="Upload preview" class="max-h-48 rounded-md object-contain mx-auto" />`
          : `<video src="${mediaPreviewUrl}" controls autoPlay muted loop playsInline class="max-h-48 rounded-md object-contain mx-auto" />`;
      
      dom.form.mediaPreviewContainer.innerHTML = `
          <div class="relative inline-block border-2 border-green-500 p-1 rounded-md bg-gray-900">
              ${mediaEl}
              <button type="button" id="remove-media-button" class="absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-1 leading-none hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
              </button>
          </div>`;
      dom.form.mediaPreviewContainer.classList.remove('hidden');
      dom.form.dropZone.classList.add('hidden');
      get('remove-media-button').addEventListener('click', handleRemoveMedia);
  } else {
      dom.form.mediaPreviewContainer.classList.add('hidden');
      dom.form.dropZone.classList.remove('hidden');
      dom.form.mediaPreviewContainer.innerHTML = '';
  }
}

function renderRepairGuide() {
    const { repairGuide, translatedGuide, mediaFile, mediaPreviewUrl, isLoading, activeStepIndex, isEditingAnnotations } = state;
    const guide = translatedGuide || repairGuide;

    if (!guide || isLoading) {
        dom.repairGuideContainer.classList.add('hidden');
        dom.repairGuideContainer.innerHTML = '';
        return;
    }

    const hasInteractiveSteps = mediaPreviewUrl && mediaFile?.type.startsWith('image/');
    
    const listToHtml = (items) => items.map(item => `<li>${item}</li>`).join('');
    const stepsToHtml = (steps) => steps.map((step, index) => {
        const desc = step.description.replace(/^(\d+\.?\s*|Step\s*\d+[:.]?\s*)/i, '');
        const isActive = activeStepIndex === index;
        return `<div class="repair-step flex items-start gap-4 p-4 rounded-md border shadow-lg transition-all duration-300 ${hasInteractiveSteps ? 'cursor-pointer' : ''} ${isActive ? 'bg-yellow-900/50 border-yellow-500 ring-2 ring-yellow-500' : 'bg-gray-800/50 border-gray-700/50 hover:border-yellow-600/50'}" data-step-index="${index}">
            <div class="flex-shrink-0 text-gray-900 font-bold rounded-full h-8 w-8 flex items-center justify-center mt-1 transition-colors ${isActive ? 'bg-yellow-400' : 'bg-yellow-500'}">${index + 1}</div>
            <div class="flex-grow">
              <p class="leading-relaxed">${desc}</p>
              ${isEditingAnnotations && isActive && step.boundingBox ? `<button class="clear-annotation-button mt-2 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors" data-step-index="${index}">${ICONS.Trash.replace('w-5 h-5', 'w-4 h-4')} ${t('clearAnnotation')}</button>` : ''}
            </div>
        </div>`;
    }).join('');
    const createCard = (title, content, icon) => `<div class="bg-gray-800/60 p-4 rounded-lg flex items-start gap-4 border border-gray-700 shadow-lg"><div class="flex-shrink-0 text-yellow-400 mt-1">${icon.replace('w-6 h-6', 'w-6 h-6')}</div><div><h3 class="font-bold text-gray-300">${title}</h3><p class="text-yellow-200">${content}</p></div></div>`;

    let feedbackHtml = `<h4 class="text-lg font-semibold text-gray-300 mb-3">${t('feedbackTitle')}</h4><div class="flex justify-center items-center gap-4"><button id="helpful-button" class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-green-600/50 text-green-300 bg-green-900/30 hover:bg-green-900/50">${ICONS.ThumbsUp.replace('w-6 h-6', 'w-5 h-5')} <span>${t('feedbackHelpful')}</span></button><button id="unhelpful-button" class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-red-600/50 text-red-300 bg-red-900/30 hover:bg-red-900/50">${ICONS.ThumbsDown.replace('w-6 h-6', 'w-5 h-5')} <span>${t('feedbackUnhelpful')}</span></button></div>`;
    
    const html = `
    <div class="mt-8 bg-gray-900/50 p-4 sm:p-6 rounded-lg shadow-2xl border border-gray-700 animate-fade-in">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">${t('repairGuideTitle')}</h2>
            <button id="export-button" class="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-600 text-yellow-300 bg-gray-700/50 hover:bg-gray-700"><div class="w-5 h-5">${ICONS.Export}</div><span class="hidden sm:inline">${t('exportGuide')}</span></button>
        </div>
        <div class="mb-6"><h3 class="text-xl font-semibold text-yellow-300 mb-3">${t('diagnosisTitle')}</h3><p class="text-gray-300 bg-gray-800/50 p-4 rounded-md border border-gray-700">${guide.diagnosis}</p></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            ${createCard(t('estimatedCostTitle'), guide.estimatedCost, ICONS.Cost)}
            ${createCard(t('partAvailabilityTitle'), guide.partAvailability, ICONS.Availability)}
            ${guide.machineDowntime ? createCard(t('machineDowntimeTitle'), guide.machineDowntime, ICONS.MachineDowntime) : ''}
            ${guide.manualLaborTime ? createCard(t('manualLaborTimeTitle'), guide.manualLaborTime, ICONS.ManualLabor) : ''}
        </div>
        <!-- Other sections like tools, materials, etc. -->
        ${guide.preventativeMaintenance?.length > 0 ? `<div class="mb-6"><h3 class="text-xl font-semibold text-cyan-300 mb-3 flex items-center gap-2"><div class="w-6 h-6">${ICONS.Preventative}</div>${t('preventativeMaintenanceTitle')}</h3><ul class="list-disc list-inside bg-cyan-900/20 p-4 rounded-md border border-cyan-700/50 space-y-2 text-cyan-200">${listToHtml(guide.preventativeMaintenance)}</ul></div>` : ''}
        ${hasInteractiveSteps ? `<div id="interactive-viewer-container" class="mb-8"></div>` : ''}
        <div><h3 class="text-xl font-semibold text-yellow-300 mb-3 flex items-center gap-2"><div class="w-6 h-6">${ICONS.Step}</div>${t('repairStepsTitle')}</h3><div class="space-y-4 text-gray-300">${stepsToHtml(guide.repairSteps)}</div></div>
        <div id="feedback-section" class="mt-8 pt-6 border-t-2 border-gray-700/50 text-center">${feedbackHtml}</div>
    </div>`;
    dom.repairGuideContainer.innerHTML = html;
    dom.repairGuideContainer.classList.remove('hidden');

    // Add event listeners for new elements
    get('export-button').addEventListener('click', handleExport);
    const feedbackSection = get('feedback-section');
    feedbackSection.addEventListener('click', (e) => {
        if(e.target.closest('#helpful-button') || e.target.closest('#unhelpful-button')) {
            feedbackSection.innerHTML = `<p class="text-green-400">${t('feedbackThanks')}</p>`;
        }
    });

    if (hasInteractiveSteps) {
        renderInteractiveViewer();
    }
    
    dom.repairGuideContainer.addEventListener('click', (e) => {
        const stepEl = e.target.closest('.repair-step');
        if (stepEl) {
            const index = parseInt(stepEl.dataset.stepIndex, 10);
            setState(s => ({ activeStepIndex: s.activeStepIndex === index ? null : index }));
        }
        const clearBtn = e.target.closest('.clear-annotation-button');
        if(clearBtn) {
          e.stopPropagation();
          const index = parseInt(clearBtn.dataset.stepIndex, 10);
          handleAnnotationChange(index, null);
        }
    });
}

function renderInteractiveViewer() {
    // This function will be called within renderRepairGuide
    const container = get('interactive-viewer-container');
    if (!container) return;

    const { repairGuide, translatedGuide, mediaPreviewUrl, activeStepIndex, isEditingAnnotations } = state;
    const guide = translatedGuide || repairGuide;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="text-2xl font-semibold text-yellow-300">${t('interactiveGuideTitle')}</h3>
                <p class="text-gray-400 text-sm">${isEditingAnnotations ? t('editingGuideDescription') : t('interactiveGuideDescription')}</p>
            </div>
            <button id="edit-annotations-button" class="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${isEditingAnnotations ? 'bg-yellow-400 text-gray-900 border-yellow-400' : 'text-yellow-300 bg-gray-700/50 border-gray-600'}">
                <div class="w-5 h-5">${ICONS.Edit}</div>
                <span class="hidden sm:inline">${isEditingAnnotations ? t('doneEditing') : t('editAnnotations')}</span>
            </button>
        </div>
        <div id="image-container" class="relative w-full max-w-full mx-auto border-2 border-gray-700 rounded-lg overflow-hidden shadow-lg bg-gray-900 ${isEditingAnnotations && activeStepIndex !== null ? 'cursor-crosshair' : ''}">
            <img id="guide-image" src="${mediaPreviewUrl}" class="block w-full h-auto max-h-[70vh] object-contain select-none" draggable="false"/>
            <div id="bounding-box" class="border-4 border-yellow-400 bg-yellow-400/30 rounded-md transition-all duration-300 ease-in-out shadow-2xl pointer-events-none"></div>
            <div id="drawing-box" class="absolute border-2 dashed #facc15 bg-yellow-400/20 pointer-events-none" style="display: none;"></div>
        </div>
    `;

    get('edit-annotations-button').addEventListener('click', () => {
        setState(s => ({ isEditingAnnotations: !s.isEditingAnnotations }));
    });
    
    // Add logic for drawing annotations
    setupAnnotationDrawing();
    
    // Update bounding box style
    updateBoundingBox();
}

function updateBoundingBox() {
    const boxEl = get('bounding-box');
    const imgEl = get('guide-image');
    if (!boxEl || !imgEl) return;
    
    const { repairGuide, translatedGuide, activeStepIndex } = state;
    const guide = translatedGuide || repairGuide;
    const activeBoxData = activeStepIndex !== null ? guide.repairSteps[activeStepIndex].boundingBox : null;

    const updateStyle = () => {
      const imageSize = { width: imgEl.clientWidth, height: imgEl.clientHeight };
      if (activeBoxData && imageSize.width > 0) {
          boxEl.style.left = `${activeBoxData.x * imageSize.width}px`;
          boxEl.style.top = `${activeBoxData.y * imageSize.height}px`;
          boxEl.style.width = `${activeBoxData.width * imageSize.width}px`;
          boxEl.style.height = `${activeBoxData.height * imageSize.height}px`;
          boxEl.style.opacity = '1';
          boxEl.style.position = 'absolute';
      } else {
          boxEl.style.opacity = '0';
      }
    };
    
    if (imgEl.complete) {
      updateStyle();
    } else {
      imgEl.onload = updateStyle;
    }
}

function setupAnnotationDrawing() {
    const container = get('image-container');
    const drawingBox = get('drawing-box');
    const image = get('guide-image');
    if (!container || !drawingBox || !image) return;

    let isDrawing = false;
    let startPoint = null;

    const handleMouseDown = (e) => {
        if (!state.isEditingAnnotations || state.activeStepIndex === null) return;
        e.preventDefault();
        isDrawing = true;
        const rect = container.getBoundingClientRect();
        startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        drawingBox.style.left = `${startPoint.x}px`;
        drawingBox.style.top = `${startPoint.y}px`;
        drawingBox.style.width = '0px';
        drawingBox.style.height = '0px';
        drawingBox.style.display = 'block';
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        drawingBox.style.left = `${Math.min(startPoint.x, currentX)}px`;
        drawingBox.style.top = `${Math.min(startPoint.y, currentY)}px`;
        drawingBox.style.width = `${Math.abs(currentX - startPoint.x)}px`;
        drawingBox.style.height = `${Math.abs(currentY - startPoint.y)}px`;
    };

    const handleMouseUp = () => {
        if (!isDrawing) return;
        isDrawing = false;
        drawingBox.style.display = 'none';

        const imageSize = { width: image.clientWidth, height: image.clientHeight };
        const boxRect = drawingBox.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const newBox = {
            x: (boxRect.left - containerRect.left) / imageSize.width,
            y: (boxRect.top - containerRect.top) / imageSize.height,
            width: boxRect.width / imageSize.width,
            height: boxRect.height / imageSize.height,
        };

        if (newBox.width > 0.01 && newBox.height > 0.01) {
            handleAnnotationChange(state.activeStepIndex, newBox);
        }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', () => { if (isDrawing) handleMouseUp(); });
}

function handleAnnotationChange(stepIndex, newBox) {
    const { repairGuide, translatedGuide } = state;
    const baseGuide = translatedGuide ? repairGuide : state.repairGuide; // always edit the base
    const newSteps = [...baseGuide.repairSteps];
    newSteps[stepIndex] = { ...newSteps[stepIndex], boundingBox: newBox || undefined };
    const newGuide = { ...baseGuide, repairSteps: newSteps };
    
    if (translatedGuide) {
        // If we are viewing a translation, we need to update the base guide and re-translate
        setState({ repairGuide: newGuide });
        handleTranslate(state.language, newGuide); // This will re-render
    } else {
        setState({ repairGuide: newGuide });
    }
}

function renderChatMessages() {
    let messagesHtml = state.chatMessages.map(msg => `
        <div class="flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[80%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-yellow-500 text-gray-900 rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}">
                <p class="text-sm break-words">${msg.text.replace(/\n/g, '<br>')}</p>
            </div>
        </div>
    `).join('');

    if (state.isChatLoading) {
        messagesHtml += `<div class="flex items-end gap-2 justify-start"><div class="max-w-[80%] p-3 rounded-lg bg-gray-700 text-gray-200 rounded-bl-none"><div class="flex items-center gap-2"><span class="h-2 w-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span><span class="h-2 w-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span><span class="h-2 w-2 bg-yellow-400 rounded-full animate-bounce"></span></div></div></div>`;
    }
    dom.chat.messages.innerHTML = messagesHtml;
    dom.chat.messages.scrollTop = dom.chat.messages.scrollHeight;
}

function renderHistoryList() {
    if (state.history.length === 0) {
        dom.history.list.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-center text-gray-400"><div class="w-16 h-16 mb-4 text-gray-600">${ICONS.History}</div><p>${t('noHistory')}</p></div>`;
        dom.history.footer.classList.add('hidden');
    } else {
        dom.history.list.innerHTML = `<ul class="space-y-3">${state.history.map(item => `
            <li class="bg-gray-700/50 p-4 rounded-lg border border-gray-600 group hover:border-yellow-500/50">
                <p class="text-sm text-gray-400 mb-1">${new Date(item.timestamp).toLocaleString()}</p>
                <p class="font-semibold text-gray-200 truncate mb-3">${item.description}</p>
                <div class="flex items-center justify-end gap-2">
                    <button class="history-delete-button text-gray-400 hover:text-red-400 p-1" data-id="${item.id}"><div class="w-5 h-5">${ICONS.Trash}</div></button>
                    <button class="history-view-button px-3 py-1.5 text-sm font-medium text-gray-900 bg-yellow-400 rounded-md hover:bg-yellow-500" data-id="${item.id}">${t('viewGuide')}</button>
                </div>
            </li>`).join('')}</ul>`;
        dom.history.footer.classList.remove('hidden');
    }
}

// --- EVENT HANDLERS & ACTIONS ---
const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (state.isLoading) return;

    const problemDescription = dom.form.description.value.trim();
    if (!problemDescription) {
        dom.form.descriptionError.textContent = t('errorDescriptionRequired');
        dom.form.descriptionError.classList.remove('hidden');
        dom.form.description.classList.add('border-red-500');
        return;
    }
    
    if (state.mediaPreviewUrl) URL.revokeObjectURL(state.mediaPreviewUrl);
    
    setState({ isLoading: true, error: null, repairGuide: null, translatedGuide: null, chatMessages: [], isChatOpen: false, chatSession: null, mediaPreviewUrl: null });
    
    try {
        const mediaFile = state.mediaFile;
        const mediaPreviewUrl = mediaFile ? URL.createObjectURL(mediaFile) : null;
        
        const guide = await generateRepairGuide(problemDescription, mediaFile);
        const newChat = createChatSession(problemDescription);
        const newHistory = addToHistory(problemDescription, guide, mediaFile);

        setState(s => ({ 
            isLoading: false, repairGuide: guide, chatSession: newChat, history: newHistory, mediaFile: s.mediaFile, mediaPreviewUrl,
            chatMessages: [{ role: 'model', text: t('chatInitialMessage') }],
        }));
        
        if (state.language !== 'en') {
            await handleTranslate(state.language, guide);
        }
        localStorage.removeItem(DRAFT_STORAGE_KEY);

    } catch (err) {
        if (state.mediaPreviewUrl) URL.revokeObjectURL(state.mediaPreviewUrl);
        setState({ isLoading: false, error: err.message || 'An unexpected error occurred.', mediaFile: null, mediaPreviewUrl: null });
    }
};

const handleLanguageChange = async (e) => {
  const langCode = e.target.value;
  setState({ language: langCode });
  updateUIText();
  if (state.repairGuide) {
      await handleTranslate(langCode, state.repairGuide);
  }
};

const handleTranslate = async (lang, guideToTranslate) => {
    if (!guideToTranslate) return;
    if (lang === 'en') {
        setState({ translatedGuide: null });
        return;
    }
    setState({ isTranslating: true, error: null });
    try {
        const translated = await translateRepairGuide(guideToTranslate, lang);
        setState({ isTranslating: false, translatedGuide: translated });
    } catch (err) {
        setState({ isTranslating: false, error: err.message || "Failed to translate.", translatedGuide: null });
    }
};

const handleSendMessage = async (e) => {
    e.preventDefault();
    const message = dom.chat.input.value.trim();
    if (!message || !state.chatSession) return;
    dom.chat.input.value = '';
    setState(s => ({ isChatLoading: true, chatMessages: [...s.chatMessages, { role: 'user', text: message }] }));
    try {
        const responseText = await sendChatMessage(state.chatSession, message);
        setState(s => ({ isChatLoading: false, chatMessages: [...s.chatMessages, { role: 'model', text: responseText }] }));
    } catch (err) {
        setState(s => ({ isChatLoading: false, chatMessages: [...s.chatMessages, { role: 'model', text: `Sorry, error: ${err.message}` }] }));
    }
};

const handleHistoryClick = (e) => {
    if (e.target.closest('.history-view-button')) {
        const id = e.target.closest('.history-view-button').dataset.id;
        const item = state.history.find(i => i.id === id);
        if (item) {
            // Note: Media file is not persisted, so can't be restored from history.
            setState({
                repairGuide: item.guide, translatedGuide: null, mediaFile: null, mediaPreviewUrl: null,
                chatSession: createChatSession(item.description),
                chatMessages: [{ role: 'model', text: `Viewing past guide for: "${item.description}".` }],
                isChatOpen: false, isHistoryOpen: false, isLoading: false, error: null,
            });
            if (state.language !== 'en') handleTranslate(state.language, item.guide);
        }
    }
    if (e.target.closest('.history-delete-button')) {
        const id = e.target.closest('.history-delete-button').dataset.id;
        setState({ history: deleteFromHistory(id) });
    }
};

const handleExport = () => {
    const guide = state.translatedGuide || state.repairGuide;
    if (!guide) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to export.');

    const listToHtml = (items) => items.map(item => `<li>${item}</li>`).join('');
    const stepsToHtml = (steps) => steps.map(step => `<li>${step.description}</li>`).join('');
    
    printWindow.document.write(`<html><head><title>Repair Guide</title><style>body{font-family:sans-serif;line-height:1.6;margin:2rem;} h1,h2{border-bottom:1px solid #ccc;}</style></head><body><h1>Repair Guide</h1><h2>Diagnosis</h2><p>${guide.diagnosis}</p><h2>Repair Steps</h2><ol>${stepsToHtml(guide.repairSteps)}</ol></body></html>`);
    printWindow.document.close();
    printWindow.print();
};

const handleFile = (file) => {
    if (state.mediaPreviewUrl) URL.revokeObjectURL(state.mediaPreviewUrl);

    if (!file) {
        setState({ mediaFile: null, mediaPreviewUrl: null });
        dom.form.mediaError.classList.add('hidden');
        return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      dom.form.mediaError.textContent = t('errorInvalidFileTypeVideo');
      dom.form.mediaError.classList.remove('hidden');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      dom.form.mediaError.textContent = t('errorFileSize', { size: MAX_FILE_SIZE_MB });
      dom.form.mediaError.classList.remove('hidden');
      return;
    }
    
    dom.form.mediaError.classList.add('hidden');
    setState({
        mediaFile: file,
        mediaPreviewUrl: URL.createObjectURL(file),
    });
};

const handleRemoveMedia = () => {
    handleFile(null);
    dom.form.fileUpload.value = '';
};


// --- INITIALIZATION ---
async function main() {
  // Setup icons
  dom.header.logo.innerHTML = ICONS.MiningTruck;
  dom.header.historyButtonIcon.innerHTML = ICONS.History;
  dom.header.translateIcon.innerHTML = ICONS.Translate;
  dom.form.cameraIcon.innerHTML = ICONS.Camera;
  dom.form.micIcon.innerHTML = ICONS.Microphone;
  dom.chat.buttonIcon.innerHTML = ICONS.Chat;
  dom.chat.headerIcon.innerHTML = ICONS.MiningTruck;
  dom.chat.closeIcon.innerHTML = ICONS.Close;
  dom.chat.sendIcon.innerHTML = ICONS.Send;
  dom.history.headerIcon.innerHTML = ICONS.History;
  dom.history.closeIcon.innerHTML = ICONS.Close;
  dom.history.clearIcon.innerHTML = ICONS.Trash;
  
  // Populate language dropdown
  dom.header.languageSelect.innerHTML = Object.values(languages)
    .map(lang => `<option value="${lang.code}">${lang.name}</option>`)
    .join('');

  await loadTranslations();
  setState({ history: getHistory() });
  updateUIText();
  dom.loadingOverlay.classList.add('hidden');

  // Load draft
  dom.form.description.value = localStorage.getItem(DRAFT_STORAGE_KEY) || '';

  subscribe(render);
  
  // Add event listeners
  dom.header.languageSelect.addEventListener('change', handleLanguageChange);
  get('history-button').addEventListener('click', () => setState(s => ({isHistoryOpen: !s.isHistoryOpen})));
  dom.history.closeButton.addEventListener('click', () => setState({isHistoryOpen: false}));
  dom.history.list.addEventListener('click', handleHistoryClick);
  dom.history.clearButton.addEventListener('click', () => { dom.history.clearConfirm.classList.remove('hidden'); dom.history.clearButton.classList.add('hidden'); });
  dom.history.clearCancelButton.addEventListener('click', () => { dom.history.clearConfirm.classList.add('hidden'); dom.history.clearButton.classList.remove('hidden'); });
  dom.history.clearConfirmButton.addEventListener('click', () => { setState({ history: clearHistory() }); dom.history.clearConfirm.classList.add('hidden'); dom.history.clearButton.classList.remove('hidden'); });
  
  dom.form.form.addEventListener('submit', handleFormSubmit);
  dom.form.description.addEventListener('input', () => {
      localStorage.setItem(DRAFT_STORAGE_KEY, dom.form.description.value);
      if (dom.form.description.value.trim()) {
          dom.form.descriptionError.classList.add('hidden');
          dom.form.description.classList.remove('border-red-500');
      }
  });

  // File Upload Listeners
  dom.form.fileUpload.addEventListener('change', (e) => handleFile(e.target.files[0]));
  dom.form.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dom.form.dropZone.classList.add('border-yellow-400'); });
  dom.form.dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dom.form.dropZone.classList.remove('border-yellow-400'); });
  dom.form.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.form.dropZone.classList.remove('border-yellow-400');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          dom.form.fileUpload.files = e.dataTransfer.files;
          handleFile(e.dataTransfer.files[0]);
      }
  });

  dom.form.cameraButton.addEventListener('click', () => setState({ isCameraOpen: true }));

  dom.chat.button.addEventListener('click', () => setState(s => ({isChatOpen: !s.isChatOpen})));
  dom.chat.closeButton.addEventListener('click', () => setState({isChatOpen: false}));
  dom.chat.form.addEventListener('submit', handleSendMessage);
  dom.chat.input.addEventListener('input', () => render(state)); 

  // Speech to Text
  setupSpeechRecognition();

  // Initial render
  render(state);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Construct service worker path robustly to avoid "new URL" errors in complex environments
      // and ensure it works correctly when deployed in a subdirectory.
      const path = window.location.pathname;
      const scope = path.substring(0, path.lastIndexOf('/') + 1);
      const swUrl = scope + 'sw.js';
      
      navigator.serviceWorker.register(swUrl).then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }, err => {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }
}

// --- SPEECH RECOGNITION ---
function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }
        if (finalTranscript) {
            dom.form.description.value += finalTranscript.trim() + ' ';
        }
    };
    recognition.onend = () => {
        if (state.isListening) recognition.start(); // Restart if it was meant to be listening
    };
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if(event.error === 'not-allowed') alert(t('microphonePermissionDeniedError'));
        setState({ isListening: false });
    };

    dom.form.speechToTextButton.addEventListener('click', () => {
        if (state.isListening) {
            recognition.stop();
            setState({ isListening: false });
        } else {
            recognition.lang = state.language;
            recognition.start();
            setState({ isListening: true });
        }
    });
}

// --- CAMERA MODAL ---
function openCameraModal() {
    dom.cameraModal.innerHTML = `
      <h2 class="sr-only">${t('takePhoto')}</h2>
      <div class="relative w-full h-full flex items-center justify-center bg-black">
          <div id="camera-loading" class="absolute inset-0 flex flex-col items-center justify-center text-white z-30">${ICONS.SmallSpinner} <p class="mt-2">${t('startingCamera')}</p></div>
          <p id="camera-error" class="absolute inset-0 flex-col items-center justify-center text-red-400 p-4 text-center hidden"></p>
          <video id="camera-video" autoplay playsinline muted class="w-full h-full object-contain"></video>
          <canvas id="camera-canvas" class="hidden"></canvas>
          <div id="camera-preview" class="w-full h-full hidden items-center justify-center"></div>
          
          <div class="absolute top-0 left-0 right-0 p-4 flex justify-end bg-gradient-to-b from-black/60 z-20">
              <button id="camera-close-button" class="p-2 text-white rounded-full bg-black/30 hover:bg-black/60">${ICONS.Close}</button>
          </div>

          <div id="camera-controls" class="absolute bottom-0 left-0 right-0 pb-6 pt-12 flex flex-col items-center gap-4 bg-gradient-to-t from-black/70 z-10">
              <!-- Controls will be added here -->
          </div>
      </div>
    `;
    dom.cameraModal.classList.remove('hidden');
    
    // Defer camera logic to allow the modal to render first
    setTimeout(initializeCamera, 10);
}

function closeCameraModal() {
    const video = get('camera-video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    dom.cameraModal.innerHTML = '';
    dom.cameraModal.classList.add('hidden');
    setState({ isCameraOpen: false });
}

async function initializeCamera() {
    const video = get('camera-video');
    const canvas = get('camera-canvas');
    const loading = get('camera-loading');
    const errorEl = get('camera-error');
    const controls = get('camera-controls');
    const preview = get('camera-preview');

    let stream, mediaRecorder, recordedChunks = [];
    let capturedMediaUrl = null;

    const stopStream = () => {
        if (stream) stream.getTracks().forEach(track => track.stop());
    };

    get('camera-close-button').addEventListener('click', () => {
      stopStream();
      closeCameraModal();
    });

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
        video.srcObject = stream;
        loading.classList.add('hidden');
    } catch (err) {
        loading.classList.add('hidden');
        errorEl.textContent = err.name === 'NotAllowedError' ? t('cameraPermissionDeniedError') : t('cameraAccessError', {message: err.message});
        errorEl.classList.remove('hidden');
        return;
    }

    const renderControls = (mode = 'image', isRecording = false) => {
        if(capturedMediaUrl) {
            controls.innerHTML = `
              <div class="w-full flex justify-around items-center px-4">
                  <button id="retake-button" class="flex flex-col items-center gap-1 text-white text-lg font-medium p-2">${ICONS.Retake}</button>
                  <button id="use-media-button" class="w-20 h-20 bg-white rounded-full flex items-center justify-center">${ICONS.Check}</button>
                  <div class="w-8 h-8"></div> 
              </div>`;
        } else {
            controls.innerHTML = `
              <div class="flex items-center justify-center gap-6 text-white font-semibold">
                 <button id="mode-image" class="px-4 py-2 rounded-full ${mode === 'image' ? 'bg-yellow-400 text-black' : ''}">Photo</button>
                 <button id="mode-video" class="px-4 py-2 rounded-full ${mode === 'video' ? 'bg-yellow-400 text-black' : ''}">Video</button>
              </div>
              <div class="h-24 flex items-center justify-center mt-2">
                 <button id="capture-button" class="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center">
                    ${isRecording ? '<div class="w-8 h-8 bg-red-500 rounded-md animate-pulse"></div>' : '<div class="w-[60px] h-[60px] bg-white rounded-full"></div>'}
                 </button>
              </div>
            `;
        }
    };
    renderControls();

    controls.addEventListener('click', async (e) => {
        const buttonId = e.target.closest('button')?.id;
        switch(buttonId) {
            case 'mode-image': renderControls('image'); break;
            case 'mode-video': renderControls('video'); break;
            case 'capture-button':
                const currentMode = get('mode-image').classList.contains('bg-yellow-400') ? 'image' : 'video';
                if (currentMode === 'image') {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(blob => {
                        capturedMediaUrl = URL.createObjectURL(blob);
                        preview.innerHTML = `<img src="${capturedMediaUrl}" class="max-w-full max-h-full object-contain"/>`;
                        video.classList.add('hidden');
                        preview.classList.remove('hidden');
                        renderControls('image');
                    }, 'image/jpeg');
                } else { // video
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                        renderControls('video', false);
                    } else {
                        recordedChunks = [];
                        mediaRecorder = new MediaRecorder(stream);
                        mediaRecorder.ondataavailable = (event) => {
                            if (event.data.size > 0) recordedChunks.push(event.data);
                        };
                        mediaRecorder.onstop = () => {
                            const blob = new Blob(recordedChunks, { type: 'video/webm' });
                            capturedMediaUrl = URL.createObjectURL(blob);
                            preview.innerHTML = `<video src="${capturedMediaUrl}" controls autoplay loop class="max-w-full max-h-full object-contain"></video>`;
                            video.classList.add('hidden');
                            preview.classList.remove('hidden');
                            renderControls('video');
                        };
                        mediaRecorder.start();
                        renderControls('video', true);
                    }
                }
                break;
            case 'retake-button':
                URL.revokeObjectURL(capturedMediaUrl);
                capturedMediaUrl = null;
                preview.classList.add('hidden');
                video.classList.remove('hidden');
                renderControls(get('mode-image')?.classList.contains('bg-yellow-400') ? 'image' : 'video');
                break;
            case 'use-media-button':
                const res = await fetch(capturedMediaUrl);
                const blob = await res.blob();
                const type = blob.type.startsWith('image/') ? 'image' : 'video';
                const extension = type === 'image' ? 'jpg' : 'webm';
                const file = new File([blob], `capture.${extension}`, { type: blob.type });
                handleFile(file);
                stopStream();
                closeCameraModal();
                break;
        }
    });
}


document.addEventListener('DOMContentLoaded', main);