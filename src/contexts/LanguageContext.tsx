import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  formatLocalizedNumber,
  getInitialLanguage,
  getLanguageOption,
  getMessages,
  LANGUAGE_STORAGE_KEY,
  type AppLanguage,
  type LanguageOption,
  type TranslationMessages,
} from '../utils/i18n';

interface LanguageContextValue {
  lang: AppLanguage;
  option: LanguageOption;
  dir: 'ltr' | 'rtl';
  isRtl: boolean;
  t: TranslationMessages;
  setLanguage: (next: AppLanguage) => void;
  formatNumber: (n: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<AppLanguage>(() => {
    if (typeof window === 'undefined') return 'en';
    return getInitialLanguage(window.localStorage, window.navigator.languages ?? window.navigator.language);
  });

  const option = useMemo(() => getLanguageOption(lang), [lang]);
  const t = useMemo(() => getMessages(lang), [lang]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = option.dir;
    document.title = t.docTitle;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', t.docDescription);
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', t.docTitle);
    }
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      ogDesc.setAttribute('content', t.heroSlogan);
    }
  }, [lang, option.dir, t]);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const formatNumber = useCallback(
    (n: number) => formatLocalizedNumber(n, lang),
    [lang]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      option,
      dir: option.dir,
      isRtl: option.dir === 'rtl',
      t,
      setLanguage,
      formatNumber,
    }),
    [lang, option, t, setLanguage, formatNumber]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
