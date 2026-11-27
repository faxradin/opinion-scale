import { Bookmark, Check, FileText, Lock, Scale, ThumbsDown } from 'lucide-react';
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

interface FigureListRowProps {
  figure: RankedFigure;
  index: number;
  isVoted: boolean;
  hasActiveVote: boolean;
  isCooldownLocked?: boolean;
  changesExhausted?: boolean;
  isBookmarked: boolean;
  isCompared: boolean;
  onDislike: (id: string) => void;
  onBookmark: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSelect: (figure: RankedFigure) => void;
}

export function FigureListRow({
  figure,
  index,
  isVoted,
  hasActiveVote,
  isCooldownLocked = false,
  changesExhausted = false,
  isBookmarked,
  isCompared,
  onDislike,
  onBookmark,
  onToggleCompare,
  onSelect,
}: FigureListRowProps) {
  const { lang, t, formatNumber } = useLanguage();
  const isLockedOut = (isCooldownLocked || (changesExhausted && !isVoted)) || (hasActiveVote && !isVoted && isCooldownLocked);
  const isSwitchCandidate = hasActiveVote && !isVoted && !isCooldownLocked && !changesExhausted;

  const displayName = getDisplayName(figure, lang);
  const secondaryName = getSecondaryName(figure, lang);
  const catLabel = translateCategory(figure.category, lang);
  const countryLabel = translateCountry(figure.country, lang);
  const bioLine =
    lang === 'fa' ? figure.shortBio : t.localizedBioTemplate(catLabel, countryLabel);

  return (
    <article
      data-testid={`figure-row-${figure.id}`}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
      className={`dn-ink-reveal group px-3.5 sm:px-5 py-3 transition-colors duration-150 ${
        isVoted
          ? 'bg-[#19090B]/80'
          : 'hover:bg-white/[0.025]'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Identity, Portrait & One-Line Dossier */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5 w-11 sm:w-20 shrink-0">
            <span
              className={`text-sm sm:text-base font-bold tabular-nums shrink-0 ${
                isVoted
                  ? 'text-red-400'
                  : 'text-red-500/90'
              }`}
              aria-label={`${t.rankLabel} ${figure.rank}`}
            >
              #{formatNumber(figure.rank)}
            </span>
            <TrendIndicator
              trend={figure.trend24h}
              change24h={figure.change24h}
              compact
            />
          </div>

          <button
            type="button"
            onClick={() => onSelect(figure)}
            aria-label={t.viewWikiAria(displayName)}
            className="w-12 h-12 rounded-sm overflow-hidden border border-zinc-800 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
          >
            <PortraitImage
              src={figure.imageUrl}
              alt={displayName}
              className="w-full h-full"
            />
          </button>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <button
                type="button"
                onClick={() => onSelect(figure)}
                className={`font-editorial text-base sm:text-[17px] font-bold text-start truncate cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-red-500 ${
                  isVoted
                    ? 'text-red-200'
                    : 'text-[#EAE6DF] hover:text-red-400'
                }`}
              >
                {displayName}
              </button>

              <span className="text-[11px] sm:text-xs text-zinc-400 max-w-full">
                {catLabel} · {countryLabel}
              </span>

              {secondaryName && (
                <span
                  dir="ltr"
                  className="hidden sm:inline text-[11px] font-mono text-zinc-500 truncate max-w-[160px]"
                >
                  {secondaryName}
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed">
              {bioLine}
            </p>
          </div>
        </div>

        {/* Share Meter & Compact Interactive Actions */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden lg:flex flex-col items-end gap-1 w-24 shrink-0 pe-2">
            <span className="text-[11px] text-zinc-400 tabular-nums">
              {t.ofTotalVotes(formatNumber(figure.sharePercent))}
            </span>
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200 bg-[#DC2626]"
                style={{ width: `${Math.min(100, Math.max(3, figure.sharePercent))}%` }}
              />
            </div>
          </div>

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
            className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-500 ${
              isVoted
                ? 'bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer'
                : isLockedOut
                ? 'bg-[#111116] border border-zinc-800 text-zinc-500 hover:border-zinc-700 cursor-pointer'
                : 'bg-[#EAE6DF] text-[#060608] hover:bg-white cursor-pointer'
            }`}
          >
            {isVoted && isCooldownLocked ? (
              <Lock className="w-3.5 h-3.5 shrink-0" />
            ) : isVoted ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : isLockedOut ? (
              <Lock className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ThumbsDown className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {isVoted && isCooldownLocked
                ? t.locked48hShort
                : isVoted
                ? t.cancelChoice
                : isSwitchCandidate
                ? t.switchOption
                : t.select}
            </span>
            <span className="tabular-nums font-semibold opacity-90">
              {formatNumber(figure.dislikes)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onBookmark(figure.id)}
            aria-pressed={isBookmarked}
            aria-label={t.bookmarkAria(displayName)}
            title={isBookmarked ? t.removeBookmark : t.bookmark}
            className={`min-h-[40px] min-w-[40px] px-2 py-1.5 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1 border transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
              isBookmarked
                ? 'bg-red-950/50 border-red-700/50 text-red-300'
                : 'bg-[#111116] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
            }`}
          >
            <Bookmark
              className="w-3.5 h-3.5 shrink-0"
              fill={isBookmarked ? 'currentColor' : 'none'}
            />
          </button>

          <button
            type="button"
            onClick={() => onToggleCompare(figure.id)}
            aria-pressed={isCompared}
            aria-label={t.compareAria(displayName)}
            title={isCompared ? t.removeCompare : t.compare}
            className={`min-h-[40px] min-w-[40px] px-2 py-1.5 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1 border transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-zinc-400 ${
              isCompared
                ? 'bg-[#EAE6DF] border-[#EAE6DF] text-[#060608]'
                : 'bg-[#111116] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
            }`}
          >
            <Scale className="w-3.5 h-3.5 shrink-0" />
          </button>

          <ShareMenu figure={figure} variant="row" />

          <button
            type="button"
            onClick={() => onSelect(figure)}
            aria-label={t.viewWikiAria(displayName)}
            className="min-h-[40px] px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-900/60 bg-[#111116] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>{t.wikipedia}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
