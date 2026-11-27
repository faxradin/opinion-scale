import { useEffect } from 'react';
import { AlertTriangle, Clock, ShieldAlert, ThumbsDown, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { RankedFigure, VotePolicyState } from '../types';
import { getDisplayName, translateCategory, translateCountry } from '../utils/i18n';
import { PortraitImage } from './PortraitImage';

interface VoteConfirmModalProps {
  targetFigure: RankedFigure | null;
  currentChosenFigure: RankedFigure | null;
  votePolicy: VotePolicyState;
  submitting: boolean;
  onConfirm: (id: string) => void;
  onCancel: () => void;
}

export function VoteConfirmModal({
  targetFigure,
  currentChosenFigure,
  votePolicy,
  submitting,
  onConfirm,
  onCancel,
}: VoteConfirmModalProps) {
  const { lang, t, formatNumber } = useLanguage();

  useEffect(() => {
    if (!targetFigure) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [targetFigure, submitting, onCancel]);

  if (!targetFigure) return null;

  const isCancelAction = Boolean(currentChosenFigure && currentChosenFigure.id === targetFigure.id);
  const isSwitchAction = Boolean(currentChosenFigure && currentChosenFigure.id !== targetFigure.id);
  const displayName = getDisplayName(targetFigure, lang);
  const catLabel = translateCategory(targetFigure.category, lang);
  const countryLabel = translateCountry(targetFigure.country, lang);

  // Remaining changes AFTER this action finishes
  const isConsumingChange = votePolicy.totalSelections >= 1 && !isCancelAction;
  const remainingAfter = isConsumingChange
    ? Math.max(0, votePolicy.remainingChanges - 1)
    : votePolicy.remainingChanges;

  return (
    <div
      data-testid="vote-confirm-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-vote-title"
    >
      <div className="dn-modal-reveal bg-[#0B0B0E] border border-zinc-800 w-full sm:max-w-lg rounded-t-xl sm:rounded-xl overflow-hidden text-[#EAE6DF] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 bg-[#120D10] border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <ThumbsDown className="w-5 h-5 text-red-400" />
            <h2 id="confirm-vote-title" className="font-editorial text-lg font-bold text-[#EAE6DF]">
              {isCancelAction ? t.confirmCancelTitle : t.confirmVoteTitle}
            </h2>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            aria-label={t.closeModal}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Selected Figure Summary */}
          <div className="flex items-center gap-3.5 bg-[#111116] border border-zinc-800 rounded-lg p-3.5">
            <PortraitImage
              src={targetFigure.imageUrl}
              alt={displayName}
              className="w-16 h-16 rounded-sm border border-zinc-700 shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-400 tabular-nums">
                  #{formatNumber(targetFigure.rank)}
                </span>
                <span className="font-editorial text-base sm:text-lg font-bold text-[#EAE6DF] truncate">
                  {displayName}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {catLabel} · {countryLabel} · {formatNumber(targetFigure.dislikes)} {t.dislikesShort}
              </p>
            </div>
          </div>

          {isSwitchAction && currentChosenFigure && (
            <div className="bg-amber-950/35 border border-amber-800/50 rounded-lg px-3.5 py-2.5 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                {t.confirmSwitchNotice(getDisplayName(currentChosenFigure, lang), displayName)}
              </span>
            </div>
          )}

          {/* 48-hour Lock & 5-change Quota Warning */}
          <div className="bg-[#140B0E] border border-red-900/50 rounded-lg p-4 space-y-2.5 text-xs sm:text-sm text-zinc-200">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {isCancelAction ? t.confirmCancelDesc : t.confirmLock48hNotice}
              </p>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-300">
              <ShieldAlert className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed tabular-nums">
                {t.confirmQuotaNotice(
                  formatNumber(remainingAfter),
                  formatNumber(votePolicy.maxChanges)
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              data-testid="confirm-vote-cancel-btn"
              className="min-h-[44px] px-4 py-2 rounded-lg border border-zinc-700 bg-[#141418] text-sm font-medium text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={submitting}
              data-testid="confirm-vote-submit-btn"
              onClick={() => {
                onConfirm(targetFigure.id);
              }}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <ThumbsDown className="w-4 h-4" />
              <span>{isCancelAction ? t.confirmCancelBtn : t.confirmSubmitFinalBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
