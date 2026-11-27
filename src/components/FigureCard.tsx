import { Bookmark, Check, ExternalLink, Lock, Scale, ThumbsDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { RankedFigure } from '../types';
import {
  getDisplayName,
  getSecondaryName,
  translateCategory,
  translateCountry,
} from '../utils/i18n';
import { PortraitImage } from './PortraitImage';
import { ShareMenu } from './ShareMenu';
import { TrendIndicator } from './TrendIndicator';

interface FigureCardProps {
  figure: RankedFigure;
  index?: number;
  isVoted: boolean;
  hasActiveVote: boolean;
  isCooldownLocked?: boolean;
  changesExhausted?: boolean;
  isBookmarked: boolean;
  isCompared: boolean;
  featured?: boolean;
  onDislike: (id: string) => void;
  onBookmark: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSelect: (figure: RankedFigure) => void;
}

export function FigureCard({
  figure,
  index = 0,
  isVoted,
  hasActiveVote,
  isCooldownLocked = false,
  changesExhausted = false,
  isBookmarked,
  isCompared,
  featured = false,
  onDislike,
  onBookmark,
  onToggleCompare,
  onSelect,
}: FigureCardProps) {
  const { lang, t, formatNumber } = useLanguage();
  const isLockedOut = isCooldownLocked || (changesExhausted && !isVoted);
  const isSwitchCandidate = hasActiveVote && !isVoted && !isCooldownLocked && !changesExhausted;

  const displayName = getDisplayName(figure, lang);
  const secondaryName = getSecondaryName(figure, lang);
  const catLabel = translateCategory(figure.category, lang);
  const countryLabel = translateCountry(figure.country, lang);
  const bioLine =
    lang === 'fa' ? figure.shortBio : t.localizedBioTemplate(catLabel, countryLabel);

  return (
    <article
      data-testid={`figure-card-${figure.id}`}
      style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
      className={`dn-ink-reveal group bg-[#0D0D11] border rounded-lg transition-colors duration-150 ${
        isVoted
          ? 'border-[#DC2626]/70 bg-[#17090B]/60'
          : 'border-zinc-800/90'
      } ${featured ? 'p-5 sm:p-6' : 'p-4 sm:p-5'}`}
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch">
        <button
          type="button"
          onClick={() => onSelect(figure)}
          aria-label={t.viewWikiAria(displayName)}
          className={`relative shrink-0 overflow-hidden rounded-sm border border-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 cursor-pointer ${
            featured ? 'w-full sm:w-44 h-52 sm:h-44' : 'w-full sm:w-28 h-48 sm:h-28'
          }`}
        >
          <PortraitImage
            src={figure.imageUrl}
            alt={displayName}
            className="w-full h-full"
          />
        </button>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <span
                  className={`text-lg sm:text-xl font-bold tabular-nums shrink-0 text-red-500`}
                  aria-label={`${t.rankLabel} ${figure.rank}`}
                >
                  #{formatNumber(figure.rank)}
                </span>
                <TrendIndicator
                  trend={figure.trend24h}
                  change24h={figure.change24h}
                />
                <button
                  type="button"
                  onClick={() => onSelect(figure)}
                  className={`text-start font-editorial text-lg sm:text-xl font-bold transition-colors truncate cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
                    isVoted
                      ? 'text-red-200'
                      : 'text-[#EAE6DF] hover:text-red-400'
                  }`}
                >
                  {displayName}
                </button>
              </div>
              <span className="text-xs text-zinc-400 tabular-nums shrink-0 whitespace-nowrap">
                {t.ofTotalVotes(formatNumber(figure.sharePercent))}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>{catLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{countryLabel}</span>
              {secondaryName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span dir="ltr" className="font-mono text-zinc-500">
                    {secondaryName}
                  </span>
                </>
              )}
            </div>

            <p className="mt-2.5 text-sm text-zinc-300 leading-relaxed line-clamp-2 tracking-[0.01em]">
              {bioLine}
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200 bg-[#DC2626]"
                style={{ width: `${Math.min(100, Math.max(2, figure.sharePercent))}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDislike(figure.id)}
                  aria-pressed={isVoted}
                  aria-label={
                    isVoted
                      ? `${t.cancelChoice} ${displayName}`
                      : isSwitchCandidate
                      ? `${t.switchOption} ${displayName}`
                      : `${t.select} ${displayName}`
                  }
                  className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-500 ${
                    isVoted
                      ? 'bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer'
                      : isLockedOut
                      ? 'bg-[#131318] border border-zinc-800 text-zinc-500 hover:border-zinc-700 cursor-pointer'
                      : 'bg-[#EAE6DF] text-[#060608] hover:bg-white cursor-pointer'
                  }`}
                >
                  {isVoted && isCooldownLocked ? (
                    <Lock className="w-4 h-4 shrink-0" />
                  ) : isVoted ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : isLockedOut ? (
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ThumbsDown className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {isVoted && isCooldownLocked
                      ? t.locked48hShort
                      : isVoted
                      ? t.yourChoiceCancel
                      : isSwitchCandidate
                      ? t.switchOption
                      : isLockedOut
                      ? t.dislikeLocked
                      : t.selectAndDislike}
                  </span>
                  <span className="tabular-nums font-semibold">
                    {formatNumber(figure.dislikes)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onBookmark(figure.id)}
                  aria-pressed={isBookmarked}
                  aria-label={t.bookmarkAria(displayName)}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
                    isBookmarked
                      ? 'bg-red-950/50 border-red-700/50 text-red-300'
                      : 'bg-[#131318] border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <Bookmark
                    className="w-4 h-4 shrink-0"
                    fill={isBookmarked ? 'currentColor' : 'none'}
                  />
                  <span>{isBookmarked ? t.bookmarked : t.bookmark}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleCompare(figure.id)}
                  aria-pressed={isCompared}
                  aria-label={t.compareAria(displayName)}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-zinc-400 ${
                    isCompared
                      ? 'bg-[#EAE6DF] border-[#EAE6DF] text-[#060608]'
                      : 'bg-[#131318] border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <Scale className="w-4 h-4 shrink-0" />
                  <span>{isCompared ? t.inCompare : t.compare}</span>
                </button>

                <ShareMenu figure={figure} variant="card" />
              </div>

              <button
                type="button"
                onClick={() => onSelect(figure)}
                aria-label={t.viewWikiAria(displayName)}
                className="min-h-[44px] px-3 py-2 text-xs sm:text-sm font-medium text-red-400 hover:text-red-300 hover:underline inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{t.sourcesAndWiki}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
