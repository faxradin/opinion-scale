import { useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Send, Share2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { RankedFigure } from '../types';
import { getDisplayName } from '../utils/i18n';
import {
  buildShareMessage,
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
} from '../utils/share';

interface ShareMenuProps {
  figure: RankedFigure;
  variant?: 'card' | 'modal' | 'row';
}

export function ShareMenu({ figure, variant = 'card' }: ShareMenuProps) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const displayName = getDisplayName(figure, lang);
  const pageUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://tarazo.app';
  const shareText = buildShareMessage(figure, lang);
  const telegramUrl = buildTelegramShareUrl(shareText, pageUrl);
  const whatsappUrl = buildWhatsAppShareUrl(shareText, pageUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${pageUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const isRow = variant === 'row';

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.shareAria(displayName)}
        className={`${
          isRow ? 'min-h-[40px] px-2.5 py-1.5 rounded-md' : 'min-h-[44px] px-3 py-2 rounded-lg'
        } text-xs font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
          open
            ? 'bg-[#EAE6DF] border-[#EAE6DF] text-[#060608]'
            : variant === 'modal'
            ? 'bg-[#141418] border-zinc-700 text-zinc-200 hover:bg-zinc-800'
            : 'bg-[#111116] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
        }`}
      >
        <Share2 className="w-3.5 h-3.5 shrink-0" />
        <span className={isRow ? 'hidden sm:inline' : ''}>{t.share}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.shareMenuAria(displayName)}
          className={`absolute end-0 z-50 w-52 bg-[#121216] border border-zinc-700 rounded-lg shadow-2xl p-1.5 space-y-1 ${
            variant === 'modal' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          <a
            role="menuitem"
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="min-h-[40px] px-3 py-2 rounded-md text-xs sm:text-sm font-medium text-zinc-100 hover:bg-zinc-800/90 flex items-center gap-2.5 transition-colors"
          >
            <Send className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{t.shareTelegram}</span>
          </a>

          <a
            role="menuitem"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="min-h-[40px] px-3 py-2 rounded-md text-xs sm:text-sm font-medium text-zinc-100 hover:bg-zinc-800/90 flex items-center gap-2.5 transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{t.shareWhatsApp}</span>
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="w-full min-h-[40px] px-3 py-2 rounded-md text-xs sm:text-sm font-medium text-zinc-200 hover:bg-zinc-800/90 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
            )}
            <span>{copied ? t.copied : t.copyTextLink}</span>
          </button>
        </div>
      )}
    </div>
  );
}
