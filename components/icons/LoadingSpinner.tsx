import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

export const LoadingSpinner: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="mt-8 text-center flex flex-col items-center justify-center">
      <div className="relative h-20 w-20">
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes spin-reverse {
              from { transform: rotate(0deg); }
              to { transform: rotate(-360deg); }
            }
            .gear-large {
              animation: spin 4s linear infinite;
            }
            .gear-small {
              animation: spin-reverse 2s linear infinite;
            }
          `}
        </style>
        {/* Large Gear */}
        <svg
          className="absolute h-20 w-20 text-yellow-400 gear-large origin-center"
          fill="none"
          viewBox="0 0 80 80"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M40 30C45.5228 30 50 34.4772 50 40C50 45.5228 45.5228 50 40 50C34.4772 50 30 45.5228 30 40C30 34.4772 34.4772 30 40 30Z"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path d="M36 5L44 5L40 15L36 5Z" fill="currentColor" />
          <path d="M36 75L44 75L40 65L36 75Z" fill="currentColor" />
          <path d="M5 36L5 44L15 40L5 36Z" fill="currentColor" />
          <path d="M75 36L75 44L65 40L75 36Z" fill="currentColor" />
          <path d="M16.5 23.5L23.5 16.5L28.5 22L22 28.5Z" fill="currentColor" />
          <path d="M56.5 23.5L63.5 16.5L68.5 22L62 28.5Z" fill="currentColor" />
          <path d="M16.5 56.5L23.5 63.5L28.5 58L22 51.5Z" fill="currentColor" />
          <path d="M56.5 56.5L63.5 63.5L68.5 58L62 51.5Z" fill="currentColor" />
        </svg>
        {/* Small Gear */}
        <svg
          className="absolute h-12 w-12 text-yellow-300 gear-small origin-center"
          style={{ top: '1rem', left: '-0.4rem' }}
          fill="none"
          viewBox="0 0 80 80"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M40 32C44.4183 32 48 35.5817 48 40C48 44.4183 44.4183 48 40 48C35.5817 48 32 44.4183 32 40C32 35.5817 35.5817 32 40 32Z"
            stroke="currentColor"
            strokeWidth="5"
          />
          <path d="M36 20L44 20L40 30L36 20Z" fill="currentColor" />
          <path d="M36 60L44 60L40 50L36 60Z" fill="currentColor" />
          <path d="M20 36L20 44L30 40L20 36Z" fill="currentColor" />
          <path d="M60 36L60 44L50 40L60 36Z" fill="currentColor" />
        </svg>
      </div>
      <p className="mt-6 text-lg text-yellow-400">{t('analyzingProblem')}</p>
    </div>
  );
};