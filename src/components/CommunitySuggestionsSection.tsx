import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Plus,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';
import type { FigureSuggestion } from '../types';
import { SUGGESTION_VOTE_THRESHOLD } from '../utils/ranking';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getDisplayName,
  getSecondaryName,
  translateCategory,
  translateCountry,
} from '../utils/i18n';
import { PortraitImage } from './PortraitImage';

interface CommunitySuggestionsSectionProps {
  suggestions: FigureSuggestion[];
  votedSuggestionIds: string[];
  loading: boolean;
  onVoteSuggestion: (id: string) => void;
  onOpenSubmitModal: () => void;
}

export function CommunitySuggestionsSection({
  suggestions,
  votedSuggestionIds,
  loading,
  onVoteSuggestion,
  onOpenSubmitModal,
}: CommunitySuggestionsSectionProps) {
  const { lang, t, formatNumber } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'collecting' | 'pending_admin'>('all');

  const filtered = suggestions.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const readyCount = suggestions.filter((s) => s.status === 'pending_admin').length;

  return (
    <section
      aria-label={t.suggestionsAriaLabel}
      className="space-y-4 dn-ink-reveal"
    >
      <div className="bg-[#0D0D11]/95 border border-zinc-800/90 rounded-lg p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="font-editorial text-xl sm:text-2xl font-bold text-[#EAE6DF]">
              {t.suggestionsTitle}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              {t.suggestionsDescBefore}{' '}
              <strong className="text-red-400 font-semibold">
                {t.suggestionsDescThreshold(formatNumber(SUGGESTION_VOTE_THRESHOLD))}
              </strong>
              {t.suggestionsDescAfter}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenSubmitModal}
            className="min-h-[44px] px-4 py-2 rounded-md bg-[#B91C1C] text-white text-xs sm:text-sm font-medium hover:bg-[#991B1B] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.submitNewSuggestionBtn}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              filter === 'all'
                ? 'bg-[#EAE6DF] text-[#060608]'
                : 'bg-[#141418] border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {t.filterAll(formatNumber(suggestions.length))}
          </button>
          <button
            type="button"
            onClick={() => setFilter('collecting')}
            aria-pressed={filter === 'collecting'}
            className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              filter === 'collecting'
                ? 'bg-[#EAE6DF] text-[#060608]'
                : 'bg-[#141418] border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {t.filterCollecting(formatNumber(suggestions.length - readyCount))}
          </button>
          <button
            type="button"
            onClick={() => setFilter('pending_admin')}
            aria-pressed={filter === 'pending_admin'}
            className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              filter === 'pending_admin'
                ? 'bg-[#B91C1C] text-white'
                : 'bg-[#141418] border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {t.filterSentToAdmin(formatNumber(readyCount))}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-400">
          {t.loadingSuggestions}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0D0D11]/95 border border-zinc-800 rounded-lg p-10 text-center space-y-2">
          <p className="text-base font-medium text-[#EAE6DF]">
            {t.noSuggestionsTitle}
          </p>
          <p className="text-xs text-zinc-500">
            {t.noSuggestionsHint}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((sug) => {
            const hasVoted = votedSuggestionIds.includes(sug.id);
            const isPendingAdmin = sug.status === 'pending_admin';
            const percent = Math.min(
              100,
              Math.round((sug.votes / SUGGESTION_VOTE_THRESHOLD) * 100)
            );
            const ai = sug.aiVerification;
            const lockedForVisitor = isPendingAdmin && hasVoted;
            const displayName = getDisplayName(sug, lang);
            const secondaryName = getSecondaryName(sug, lang);
            const catLabel = translateCategory(sug.category, lang);
            const countryLabel = translateCountry(sug.country, lang);
            const bioText =
              lang === 'fa'
                ? sug.shortBio
                : t.localizedBioTemplate(catLabel, countryLabel);

            return (
              <article
                key={sug.id}
                data-testid={`suggestion-card-${sug.id}`}
                data-status={sug.status}
                className={`bg-[#0D0D11]/95 border rounded-lg p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                  isPendingAdmin ? 'border-red-800/70' : 'border-zinc-800/90'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {ai?.verifiedImageUrl && (
                        <PortraitImage
                          src={ai.verifiedImageUrl}
                          alt={displayName}
                          className="w-12 h-12 rounded-sm border border-zinc-800 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="font-editorial text-lg font-bold text-[#EAE6DF] truncate">
                          {displayName}
                        </h3>
                        <p className="text-xs text-zinc-400">
                          {catLabel} · {countryLabel}
                          {secondaryName && (
                            <span dir="ltr" className="font-mono text-zinc-500 ms-2">
                              {secondaryName}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-medium inline-flex items-center gap-1 shrink-0 ${
                        isPendingAdmin ? 'text-emerald-400' : 'text-zinc-400'
                      }`}
                    >
                      {isPendingAdmin ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{t.statusPendingAdmin}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{t.statusCollecting}</span>
                        </>
                      )}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
                    {bioText}
                  </p>

                  {isPendingAdmin && (
                    <div className="bg-[#121217] border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {ai?.status === 'verified'
                            ? t.aiVerifiedBanner
                            : ai?.status === 'pending'
                            ? t.aiPendingBanner
                            : t.aiReadyBanner}
                        </span>
                      </div>
                      {lang === 'fa' && ai?.status === 'verified' && ai.verificationNotes && (
                        <p className="text-[11px] text-zinc-400 line-clamp-2">
                          {ai.verificationNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-zinc-400">
                        {t.progressToAdmin(formatNumber(percent))}
                      </span>
                      <span className="font-semibold text-[#EAE6DF]">
                        {t.votesRatio(
                          formatNumber(sug.votes),
                          formatNumber(SUGGESTION_VOTE_THRESHOLD)
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          isPendingAdmin ? 'bg-emerald-500' : 'bg-[#DC2626]'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={lockedForVisitor}
                      onClick={() => onVoteSuggestion(sug.id)}
                      aria-pressed={hasVoted}
                      className={`min-h-[40px] flex-1 px-4 py-2 rounded-md text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                        lockedForVisitor
                          ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 cursor-not-allowed'
                          : hasVoted
                          ? 'bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer'
                          : 'bg-[#EAE6DF] text-[#060608] hover:bg-white cursor-pointer'
                      }`}
                    >
                      {hasVoted ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <ThumbsUp className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {lockedForVisitor
                          ? t.voteSubmittedSent
                          : hasVoted
                          ? t.voteRecordedCancel
                          : t.votePositiveForEntry}
                      </span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
