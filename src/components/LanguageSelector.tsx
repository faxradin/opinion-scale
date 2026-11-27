import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGE_OPTIONS } from '../utils/i18n';

export function LanguageSelector() {
  const { lang, option, t, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block shrink-0">
      <button
        type="button"
        data-testid="language-selector"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t.languageSelectorLabel} (${option.nativeName})`}
        title={t.languageSelectorLabel}
        className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-red-500 ${
          open
            ? 'bg-[#EAE6DF] border-[#EAE6DF] text-[#060608]'
            : 'bg-[#111116] border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white'
        }`}
      >
        <Globe className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" />
        <span className="font-semibold tracking-wide">{option.shortCode}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="language-menu"
          aria-label={t.languageMenuTitle}
          className="absolute end-0 top-full mt-2 z-50 w-56 bg-[#111116] border border-zinc-700/90 rounded-lg shadow-2xl p-1.5 max-h-[75vh] overflow-y-auto"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 border-b border-zinc-800/90 mb-1">
            {t.languageMenuTitle}
          </div>
          <div className="space-y-0.5">
            {LANGUAGE_OPTIONS.map((item) => {
              const selected = item.code === lang;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="menuitem"
                  data-testid={`lang-option-${item.code}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    setLanguage(item.code);
                    setOpen(false);
                  }}
                  className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-md text-xs sm:text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-red-950/60 text-[#EAE6DF] border border-red-800/70 font-semibold'
                      : 'text-zinc-200 hover:bg-zinc-800/80'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span dir={item.dir} className="truncate">
                      {item.nativeName}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase shrink-0">
                      {item.shortCode}
                    </span>
                  </span>
                  {selected && (
                    <Check className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
