import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { SendIcon } from './icons/SendIcon';
import { CloseIcon } from './icons/CloseIcon';
import { MiningTruckIcon } from './icons/MiningTruckIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface ChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const Chatbot: React.FC<ChatbotProps> = ({ isOpen, onClose, messages, onSendMessage, isLoading }) => {
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isLoading]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-0 right-0 sm:bottom-8 sm:right-8 w-full h-full sm:w-[400px] sm:h-[600px] sm:max-h-[80vh] z-50 flex flex-col">
       <div className="flex flex-col flex-grow bg-gray-800 border-2 border-yellow-500/50 shadow-2xl sm:rounded-lg overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <MiningTruckIcon className="w-8 h-8 text-yellow-400" />
            <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">{t('chatTitle')}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label={t('closeChat')} title={t('tooltipCloseChat')}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-yellow-500 text-gray-900 rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                <p className="text-sm break-words">{msg.text}</p>
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex items-end gap-2 justify-start">
                <div className="max-w-[80%] p-3 rounded-lg bg-gray-700 text-gray-200 rounded-bl-none">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="h-2 w-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="h-2 w-2 bg-yellow-400 rounded-full animate-bounce"></span>
                    </div>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-gray-900/70 border-t border-gray-700">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chatPlaceholder')}
              className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition duration-200 text-gray-200 placeholder-gray-400"
              disabled={isLoading}
              title={t('tooltipChatInput')}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 bg-yellow-400 text-gray-900 rounded-md hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              aria-label={t('sendMessage')}
              title={t('tooltipSendMessage')}
            >
              <SendIcon className="w-6 h-6" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;