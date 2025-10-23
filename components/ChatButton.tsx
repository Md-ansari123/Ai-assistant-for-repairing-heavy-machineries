import React from 'react';
import { ChatIcon } from './icons/ChatIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface ChatButtonProps {
    onClick: () => void;
}

const ChatButton: React.FC<ChatButtonProps> = ({ onClick }) => {
    const { t } = useLanguage();
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 bg-yellow-400 text-gray-900 w-16 h-16 rounded-full shadow-lg flex items-center justify-center hover:bg-yellow-500 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-500 z-40 will-change-transform"
            aria-label="Open chat assistant"
            title={t('tooltipOpenChat')}
        >
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
            </span>
            <ChatIcon className="w-8 h-8" />
        </button>
    );
};

export default ChatButton;