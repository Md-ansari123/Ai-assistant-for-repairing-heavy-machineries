import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

// Define the shape of a single translation file's content
type TranslationFile = Record<string, string>;

// Define the structure for storing all loaded translations
type AllTranslations = {
  [key: string]: TranslationFile;
};

interface Language {
  code: string;
  name: string;
}

const languages: { [key: string]: Language } = {
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

interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, replacements?: { [key: string]: string | number }) => string;
  languages: typeof languages;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState<AllTranslations | null>(null);

  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const [enRes, enInRes, hiRes, bnRes, teRes, taRes, knRes, urRes, mrRes, guRes] = await Promise.all([
          fetch('/translations/en.json'),
          fetch('/translations/en_in.json'),
          fetch('/translations/hi.json'),
          fetch('/translations/bn.json'),
          fetch('/translations/te.json'),
          fetch('/translations/ta.json'),
          fetch('/translations/kn.json'),
          fetch('/translations/ur.json'),
          fetch('/translations/mr.json'),
          fetch('/translations/gu.json'),
        ]);

        if (!enRes.ok || !enInRes.ok || !hiRes.ok || !bnRes.ok || !teRes.ok || !taRes.ok || !knRes.ok || !urRes.ok || !mrRes.ok || !guRes.ok) {
            throw new Error('Failed to fetch one or more translation files.');
        }

        const enData = await enRes.json();
        const enInData = await enInRes.json();
        const hiData = await hiRes.json();
        const bnData = await bnRes.json();
        const teData = await teRes.json();
        const taData = await taRes.json();
        const knData = await knRes.json();
        const urData = await urRes.json();
        const mrData = await mrRes.json();
        const guData = await guRes.json();

        setTranslations({
          en: enData,
          en_in: enInData,
          hi: hiData,
          bn: bnData,
          te: teData,
          ta: taData,
          kn: knData,
          ur: urData,
          mr: mrData,
          gu: guData,
        });
      } catch (error) {
        console.error("Failed to load translations:", error);
      }
    };

    fetchTranslations();
  }, []);

  const t = (key: string, replacements?: { [key: string]: string | number }): string => {
    if (!translations) {
      return key; 
    }
    
    const currentLangTranslations = translations[language];
    const englishTranslations = translations['en'];
    
    let translation = currentLangTranslations?.[key] || englishTranslations?.[key] || key;
    
    if (replacements) {
        Object.entries(replacements).forEach(([rKey, value]) => {
            translation = translation.replace(new RegExp(`{{${rKey}}}`, 'g'), String(value));
        });
    }
    return translation;
  };
  
  if (!translations) {
      return (
        <div className="bg-gray-900 text-gray-100 min-h-screen flex items-center justify-center">
            <p className="text-yellow-400 text-lg">Loading application...</p>
        </div>
      );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};