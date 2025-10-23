import React, { useState } from 'react';
import type { RepairHistoryItem } from '../types';
import { CloseIcon } from './icons/CloseIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { TrashIcon } from './icons/TrashIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface HistoryProps {
  isOpen: boolean;
  onClose: () => void;
  historyItems: RepairHistoryItem[];
  onView: (item: RepairHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const History: React.FC<HistoryProps> = ({ isOpen, onClose, historyItems, onView, onDelete, onClear }) => {
  const { t } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleClear = () => {
    onClear();
    setShowConfirm(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full max-w-md h-full bg-gray-800 border-l-2 border-yellow-500/50 shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <header className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <HistoryIcon className="w-7 h-7 text-yellow-400" />
            <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">{t('historyTitle')}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label={t('closeHistory')} title={t('tooltipCloseHistory')}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          {historyItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
              <HistoryIcon className="w-16 h-16 mb-4 text-gray-600" />
              <p>{t('noHistory')}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {historyItems.map(item => (
                <li key={item.id} className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 group hover:border-yellow-500/50 transition-all">
                  <p className="text-sm text-gray-400 mb-1">{new Date(item.timestamp).toLocaleString()}</p>
                  <p className="font-semibold text-gray-200 truncate mb-3">{item.description}</p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-gray-400 hover:text-red-400 transition-colors p-1"
                      aria-label={t('deleteEntry')}
                      title={t('tooltipDeleteEntry')}
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => onView(item)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-900 bg-yellow-400 rounded-md hover:bg-yellow-500 transition-colors"
                      title={t('tooltipViewGuide')}
                    >
                      {t('viewGuide')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {/* Footer */}
        {historyItems.length > 0 && (
          <footer className="p-4 bg-gray-900/70 border-t border-gray-700 flex-shrink-0">
            {showConfirm ? (
              <div className="text-center">
                  <p className="text-sm text-yellow-200 mb-3">{t('confirmClearHistory')}</p>
                  <div className="flex justify-center gap-4">
                      <button onClick={() => setShowConfirm(false)} className="px-4 py-1.5 text-sm rounded-md bg-gray-600 hover:bg-gray-500 text-white" title={t('tooltipCancelClear')}>
                          {t('cancel')}
                      </button>
                      <button onClick={handleClear} className="px-4 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white" title={t('tooltipConfirmClear')}>
                          {t('confirmDelete')}
                      </button>
                  </div>
              </div>
            ) : (
                <button
                onClick={() => setShowConfirm(true)}
                className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-red-700/50 rounded-md shadow-sm text-sm font-medium text-red-300 hover:bg-red-900/30 hover:border-red-600 transition-colors"
                title={t('tooltipClearHistory')}
                >
                <TrashIcon className="w-5 h-5" />
                {t('clearHistory')}
                </button>
            )}
          </footer>
        )}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default History;