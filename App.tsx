
import React, { useReducer } from 'react';
import type { Chat } from "@google/genai";
import Header from './components/Header';
import ProblemInputForm from './components/ProblemInputForm';
import RepairGuide from './components/RepairGuide';
import History from './components/History';
import { LoadingSpinner } from './components/icons/LoadingSpinner';
import { generateRepairGuide, createChatSession, sendChatMessage, translateRepairGuide } from './services/geminiService';
import type { RepairGuideResponse, ChatMessage, RepairHistoryItem } from './types';
import ChatButton from './components/ChatButton';
import Chatbot from './components/Chatbot';
import { useLanguage } from './contexts/LanguageContext';

// --- History Management ---
const HISTORY_STORAGE_KEY = 'repairHistory';

const getHistory = (): RepairHistoryItem[] => {
  try {
    const historyJson = localStorage.getItem(HISTORY_STORAGE_KEY);
    return historyJson ? JSON.parse(historyJson) : [];
  } catch (e) {
    console.error("Failed to load history from localStorage", e);
    return [];
  }
};

const saveHistory = (history: RepairHistoryItem[]): void => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history to localStorage", e);
  }
};

const addToHistory = (description: string, guide: RepairGuideResponse, mediaFileUrl?: string): RepairHistoryItem[] => {
  const currentHistory = getHistory();
  const newItem: RepairHistoryItem = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    description,
    guide,
    mediaFileUrl
  };
  const newHistory = [newItem, ...currentHistory].slice(0, 50); // Keep last 50 entries
  saveHistory(newHistory);
  return newHistory;
};

const deleteFromHistory = (id: string): RepairHistoryItem[] => {
  const currentHistory = getHistory();
  const newHistory = currentHistory.filter(item => item.id !== id);
  saveHistory(newHistory);
  return newHistory;
};

const clearHistory = (): RepairHistoryItem[] => {
  saveHistory([]);
  return [];
};
// --- End History Management ---

interface AppState {
  isLoading: boolean;
  isTranslating: boolean;
  error: string | null;
  repairGuide: RepairGuideResponse | null;
  translatedGuide: RepairGuideResponse | null;
  chatSession: Chat | null;
  isChatOpen: boolean;
  isChatLoading: boolean;
  chatMessages: ChatMessage[];
  isHistoryOpen: boolean;
  history: RepairHistoryItem[];
  mediaFileUrl: string | null;
}

type AppAction =
  | { type: 'START_ANALYSIS' }
  | { type: 'ANALYSIS_SUCCESS'; payload: { guide: RepairGuideResponse; chat: Chat; newHistory: RepairHistoryItem[]; mediaFileUrl: string | null; } }
  | { type: 'ANALYSIS_FAILURE'; payload: string }
  | { type: 'SEND_CHAT_MESSAGE'; payload: string }
  | { type: 'RECEIVE_CHAT_RESPONSE'; payload: string }
  | { type: 'CHAT_ERROR'; payload: string }
  | { type: 'TOGGLE_CHAT' }
  | { type: 'TOGGLE_HISTORY' }
  | { type: 'VIEW_HISTORY_ITEM'; payload: RepairHistoryItem }
  | { type: 'SET_HISTORY'; payload: RepairHistoryItem[] }
  | { type: 'START_TRANSLATION' }
  | { type: 'TRANSLATION_SUCCESS'; payload: RepairGuideResponse | null }
  | { type: 'TRANSLATION_FAILURE'; payload: string };

const initialState: AppState = {
  isLoading: false,
  isTranslating: false,
  error: null,
  repairGuide: null,
  translatedGuide: null,
  chatSession: null,
  isChatOpen: false,
  isChatLoading: false,
  chatMessages: [],
  isHistoryOpen: false,
  history: getHistory(),
  mediaFileUrl: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_ANALYSIS':
      if (state.mediaFileUrl) URL.revokeObjectURL(state.mediaFileUrl);
      return {
        ...state,
        isLoading: true,
        error: null,
        repairGuide: null,
        translatedGuide: null,
        chatMessages: [],
        isChatOpen: false,
        chatSession: null,
        mediaFileUrl: null,
      };
    case 'ANALYSIS_SUCCESS':
      const { guide, chat, newHistory, mediaFileUrl } = action.payload;
      return {
        ...state,
        isLoading: false,
        repairGuide: guide,
        chatSession: chat,
        history: newHistory,
        mediaFileUrl,
        chatMessages: [{ role: 'model', text: `I can help with that. Here's a repair guide. Feel free to ask any follow-up questions.` }],
      };
    case 'ANALYSIS_FAILURE':
      return { ...state, isLoading: false, error: action.payload };
    case 'SEND_CHAT_MESSAGE':
      return {
        ...state,
        isChatLoading: true,
        chatMessages: [...state.chatMessages, { role: 'user', text: action.payload }],
      };
    case 'RECEIVE_CHAT_RESPONSE':
      return {
        ...state,
        isChatLoading: false,
        chatMessages: [...state.chatMessages, { role: 'model', text: action.payload }],
      };
    case 'CHAT_ERROR':
      return {
        ...state,
        isChatLoading: false,
        chatMessages: [...state.chatMessages, { role: 'model', text: `Sorry, I encountered an error: ${action.payload}` }],
      };
    case 'TOGGLE_CHAT':
      return { ...state, isChatOpen: !state.isChatOpen };
    case 'TOGGLE_HISTORY':
      return { ...state, isHistoryOpen: !state.isHistoryOpen };
    case 'VIEW_HISTORY_ITEM':
      const item = action.payload;
      const newChatFromHistory = createChatSession(item.description);
      if (state.mediaFileUrl) URL.revokeObjectURL(state.mediaFileUrl);
      return {
          ...state,
          repairGuide: item.guide,
          translatedGuide: null,
          chatSession: newChatFromHistory,
          mediaFileUrl: item.mediaFileUrl || null,
          chatMessages: [{ role: 'model', text: `Viewing a past repair guide for: "${item.description}". Ask me anything about it.` }],
          isChatOpen: false,
          isHistoryOpen: false,
          isLoading: false,
          error: null,
      };
    case 'SET_HISTORY':
      return { ...state, history: action.payload };
    case 'START_TRANSLATION':
      return { ...state, isTranslating: true, error: null };
    case 'TRANSLATION_SUCCESS':
      return { ...state, isTranslating: false, translatedGuide: action.payload };
    case 'TRANSLATION_FAILURE':
      return { ...state, isTranslating: false, error: action.payload, translatedGuide: null };
    default:
      return state;
  }
}

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { repairGuide, translatedGuide } = state;
  const { language, setLanguage, t } = useLanguage();
  
  const handleFormSubmit = async (problemDescription: string, mediaFile: File | null) => {
    dispatch({ type: 'START_ANALYSIS' });
    let mediaFileUrl: string | null = null;
    try {
      if (mediaFile && mediaFile.type.startsWith('image/')) {
        mediaFileUrl = URL.createObjectURL(mediaFile);
      }
      const guide = await generateRepairGuide(problemDescription, mediaFile);
      const newChat = createChatSession(problemDescription);
      const newHistory = addToHistory(problemDescription, guide, mediaFileUrl || undefined);
      
      dispatch({ type: 'ANALYSIS_SUCCESS', payload: { guide, chat: newChat, newHistory, mediaFileUrl } });

      if (language !== 'en') {
        handleTranslate(language, guide);
      }
    } catch (err: any) {
      if (mediaFileUrl) URL.revokeObjectURL(mediaFileUrl);
      const errorMessage = err.message || 'An unexpected error occurred. Please try again.';
      dispatch({ type: 'ANALYSIS_FAILURE', payload: errorMessage });
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!state.chatSession) {
      dispatch({ type: 'CHAT_ERROR', payload: 'Sorry, the chat session has expired. Please start a new analysis.' });
      return;
    }
    dispatch({ type: 'SEND_CHAT_MESSAGE', payload: message });
    try {
      const responseText = await sendChatMessage(state.chatSession, message);
      dispatch({ type: 'RECEIVE_CHAT_RESPONSE', payload: responseText });
    } catch (err: any) {
      dispatch({ type: 'CHAT_ERROR', payload: err.message });
    }
  };

  const handleTranslate = async (lang: string, guideToTranslate: RepairGuideResponse | null) => {
    if (!guideToTranslate) return;
    if (lang === 'en') {
      dispatch({ type: 'TRANSLATION_SUCCESS', payload: null });
      return;
    }
    dispatch({ type: 'START_TRANSLATION' });
    try {
      const translated = await translateRepairGuide(guideToTranslate, lang);
      dispatch({ type: 'TRANSLATION_SUCCESS', payload: translated });
    } catch (err: any) {
      const errorMessage = err.message || "Failed to translate the guide. Please try again.";
      dispatch({ type: 'TRANSLATION_FAILURE', payload: errorMessage });
    }
  };

  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode);
    if (repairGuide) {
      handleTranslate(langCode, repairGuide);
    }
  };

  const handleViewHistoryItem = (item: RepairHistoryItem) => {
    dispatch({ type: 'VIEW_HISTORY_ITEM', payload: item });
    if (language !== 'en') {
        handleTranslate(language, item.guide);
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    const newHistory = deleteFromHistory(id);
    dispatch({ type: 'SET_HISTORY', payload: newHistory });
  };
  
  const handleClearHistory = () => {
    const newHistory = clearHistory();
    dispatch({ type: 'SET_HISTORY', payload: newHistory });
  };
  
  const currentGuide = translatedGuide || repairGuide;

  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen font-sans">
      <Header 
        onLanguageChange={handleLanguageChange}
        isTranslating={state.isTranslating}
        onHistoryClick={() => dispatch({ type: 'TOGGLE_HISTORY' })}
      />
      <main className="container mx-auto p-4 sm:p-6 md:p-8 max-w-4xl">
        <ProblemInputForm onSubmit={handleFormSubmit} isLoading={state.isLoading} />
        {state.error && (
          <div className="mt-6 bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg text-center">
            <p><strong>{t('errorLabel')}:</strong> {state.error}</p>
          </div>
        )}
        {state.isLoading && <LoadingSpinner />}
        {currentGuide && !state.isLoading && (
          <RepairGuide guide={currentGuide} mediaFileUrl={state.mediaFileUrl} />
        )}
      </main>
      {state.chatSession && (
        <>
          <ChatButton onClick={() => dispatch({ type: 'TOGGLE_CHAT' })} />
          <Chatbot
            isOpen={state.isChatOpen}
            onClose={() => dispatch({ type: 'TOGGLE_CHAT' })}
            messages={state.chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={state.isChatLoading}
          />
        </>
      )}
      <History
        isOpen={state.isHistoryOpen}
        onClose={() => dispatch({ type: 'TOGGLE_HISTORY' })}
        historyItems={state.history}
        onView={handleViewHistoryItem}
        onDelete={handleDeleteHistoryItem}
        onClear={handleClearHistory}
      />
    </div>
  );
};

export default App;