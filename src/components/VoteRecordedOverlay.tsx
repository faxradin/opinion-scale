import { useEffect } from 'react';
import { CheckCircle2, Clock, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { RankedFigure, VotePolicyState } from '../types';
import { getDisplayName, translateCategory, translateCountry } from '../utils/i18n';
import { PortraitImage } from './PortraitImage';

interface VoteRecordedOverlayProps {
  figure: RankedFigure | null;
  votePolicy: VotePolicyState;
  onClose: () => void;
}

/**
 * Short, calm confirmation shown after a visitor's vote is saved.
 */
export function VoteRecordedOverlay({ figure, votePolicy, onClose }: VoteRecordedOverlayProps) {
  const { lang, t, formatNumber } = useLanguage();

  useEffect(() => {
    if (!figure) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const timer = window.setTimeout(onClose, 2800);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [figure, onClose]);

  if (!figure) return null;

  const displayName = getDisplayName(figure, lang);
  const catLabel = translateCategory(figure.category, lang);
  const countryLabel = translateCountry(figure.country, lang);

  return (
    <div
      data-testid="vote-recorded-overlay"
      role="status"
      aria-live="polite"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="dn-modal-reveal relative w-full max-w-md rounded-xl border border-zinc-800 bg-[#0B0B0E] p-6 sm:p-7 shadow-2xl cursor-default"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeModal}
          className="absolute top-3 end-3 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span>{t.voteSavedEyebrow}</span>
          </div>

          <div className="w-20 h-20 rounded-md overflow-hidden border border-zinc-700">
            <PortraitImage src={figure.imageUrl} alt={displayName} className="w-full h-full" />
          </div>

          <div className="space-y-1">
            <p className="font-editorial text-2xl font-bold text-[#F5F2EB]">{displayName}</p>
            <p className="text-xs text-zinc-400">
              {catLabel} · {countryLabel} · #{formatNumber(figure.rank)}
            </p>
          </div>

          <div className="space-y-1.5 text-xs text-zinc-300">
            <p className="inline-flex items-center gap-1.5 font-semibold text-zinc-200">
              <Clock className="w-3.5 h-3.5" />
              <span>{t.voteSavedLocked48h}</span>
            </p>
            <p className="text-zinc-400 tabular-nums">
              {t.confirmQuotaNotice(
                formatNumber(votePolicy.remainingChanges),
                formatNumber(votePolicy.maxChanges)
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
