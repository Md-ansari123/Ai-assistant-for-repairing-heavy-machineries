import React from 'react';
import { MiningTruckIcon } from './icons/MiningTruckIcon';
import { TranslateIcon } from './icons/TranslateIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface HeaderProps {
    onLanguageChange: (langCode: string) => void;
    isTranslating: boolean;
    onHistoryClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLanguageChange, isTranslating, onHistoryClick }) => {
  const { t, language, languages } = useLanguage();
  return (
    <header className="flex items-center justify-between p-4 border-b-2 border-yellow-500/30">
      {/* Left side: Logo & Title */}
      <div className="flex items-center justify-start gap-3 sm:gap-4">
        <MiningTruckIcon className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-400" />
        <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
                {t('appTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-gray-400">{t('appSubtitle')}</p>
        </div>
      </div>

      {/* Right side: Controls */}
      <div className="flex items-center gap-2 sm:gap-4">
        <button 
          onClick={onHistoryClick}
          className="text-gray-400 hover:text-yellow-300 transition-colors p-2 rounded-full hover:bg-gray-800"
          aria-label={t('historyTitle')}
          title={t('tooltipHistory')}
        >
          <HistoryIcon className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <TranslateIcon className="w-5 h-5 text-gray-400 hidden sm:block" />
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            disabled={isTranslating}
            className="bg-gray-800 border border-gray-600 text-gray-200 text-xs sm:text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 p-1.5 sm:p-2 pr-7 sm:pr-8 appearance-none"
            aria-label="Select language for translation"
            title={t('tooltipLanguage')}
          >
            {Object.values(languages).map(lang => (
              <option key={lang.code} value={lang.code}>{lang.name}</option>
            ))}
          </select>
          {isTranslating && <span className="text-xs sm:text-sm text-yellow-300 animate-pulse hidden md:block">{t('translating')}</span>}
        </div>
      </div>
    </header>
  );
};

export default Header;