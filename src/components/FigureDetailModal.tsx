import { useEffect, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  SearchCheck,
  ThumbsDown,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { AiResearchResult, DislikeEvent, RankedFigure, WikiDetails } from '../types';
import {
  getDisplayName,
  getSecondaryName,
  translateCategory,
  translateCountry,
} from '../utils/i18n';
import { isSafeHttpUrl } from '../utils/ranking';
import { DislikeHistoryChart } from './DislikeHistoryChart';
import { PortraitImage } from './PortraitImage';
import { ShareMenu } from './ShareMenu';
import { TrendIndicator } from './TrendIndicator';

interface FigureDetailModalProps {
  figure: RankedFigure | null;
  dislikeEvents?: DislikeEvent[];
  isVoted: boolean;
  hasActiveVote: boolean;
  isCooldownLocked?: boolean;
  changesExhausted?: boolean;
  isBookmarked: boolean;
  voteNotice?: string | null;
  onClose: () => void;
  onDislike: (id: string) => void;
  onBookmark: (id: string) => void;
}

export function FigureDetailModal({
  figure,
  dislikeEvents = [],
  isVoted,
  hasActiveVote,
  isCooldownLocked = false,
  changesExhausted = false,
  isBookmarked,
  voteNotice,
  onClose,
  onDislike,
  onBookmark,
}: FigureDetailModalProps) {
  const { lang, t, formatNumber } = useLanguage();
  const [wiki, setWiki] = useState<WikiDetails | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);


  const [aiResult, setAiResult] = useState<AiResearchResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!figure) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [figure, onClose]);

  useEffect(() => {
    if (!figure) return;

    let cancelled = false;
    setWiki(null);
    setWikiError(null);
    setWikiLoading(true);
    setAiResult(null);
    setAiError(null);

    const params = new URLSearchParams({
      figureId: figure.id,
      name: figure.name,
      englishName: figure.englishName || '',
      wikiTitleFa: figure.wikiTitleFa || '',
      wikiTitleEn: figure.wikiTitleEn || '',
      lang,
    });

    fetch(`/api/wiki?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || t.wikiFallbackError);
        }
        return (await res.json()) as WikiDetails;
      })
      .then((data) => {
        if (!cancelled) {
          setWiki(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setWikiError(err instanceof Error ? err.message : t.wikiFallbackError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWikiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [figure?.id, lang]);

  if (!figure) return null;

  const displayName = getDisplayName(figure, lang);
  const secondaryName = getSecondaryName(figure, lang);
  const catLabel = translateCategory(figure.category, lang);
  const countryLabel = translateCountry(figure.country, lang);
  const bioLine =
    lang === 'fa' ? figure.shortBio : t.localizedBioTemplate(catLabel, countryLabel);

  const isLockedOut = isCooldownLocked || (changesExhausted && !isVoted);
  const isSwitchCandidate = hasActiveVote && !isVoted && !isCooldownLocked && !changesExhausted;

  const handleDeepResearch = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          englishName: figure.englishName,
          category: figure.category,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || t.aiReportError);
      }
      const data = (await res.json()) as AiResearchResult;
      setAiResult(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t.aiReportError);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="dn-modal-reveal bg-[#0B0B0E] border border-zinc-800 w-full sm:max-w-2xl max-h-[90vh] rounded-t-xl sm:rounded-xl flex flex-col overflow-hidden text-[#EAE6DF] shadow-2xl">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-zinc-800 bg-[#111116]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs font-semibold tabular-nums text-red-400"
              >
                {t.rankAndDislikes(formatNumber(figure.rank), formatNumber(figure.dislikes))}
              </span>
              <TrendIndicator
                trend={figure.trend24h}
                change24h={figure.change24h}
              />
            </div>
            <h2
              id="detail-modal-title"
              className="font-editorial text-xl font-bold truncate text-[#EAE6DF]"
            >
              {displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeModal}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6 ">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <PortraitImage
              src={wiki?.thumbnailUrl || figure.imageUrl}
              alt={displayName}
              noir={false}
              className="w-28 h-28 rounded-sm border border-zinc-800 shrink-0"
            />
            <div className="space-y-2.5 flex-1">
              <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2">
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
              <p className="text-sm text-zinc-300 leading-relaxed tracking-[0.01em]">
                {bioLine}
              </p>

              {voteNotice && (
                <p className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg px-3 py-2">
                  {voteNotice}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onDislike(figure.id)}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                    isVoted
                      ? 'bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer'
                      : isLockedOut
                      ? 'bg-[#141418] border border-zinc-800 text-zinc-500 cursor-pointer'
                      : 'bg-[#EAE6DF] text-[#060608] hover:bg-white cursor-pointer'
                  }`}
                >
                  {isVoted && isCooldownLocked ? (
                    <Lock className="w-4 h-4" />
                  ) : isVoted ? (
                    <Check className="w-4 h-4" />
                  ) : isLockedOut ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <ThumbsDown className="w-4 h-4" />
                  )}
                  <span>
                    {isVoted && isCooldownLocked
                      ? t.locked48hShort
                      : isVoted
                      ? t.cancelChoice
                      : isSwitchCandidate
                      ? t.switchOption
                      : isLockedOut
                      ? t.oneOptionSelected
                      : t.chooseThisOption}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onBookmark(figure.id)}
                  className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 border cursor-pointer transition-colors ${
                    isBookmarked
                      ? 'bg-red-950/50 border-red-700/50 text-red-300'
                      : 'bg-[#141418] border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <Bookmark
                    className="w-4 h-4"
                    fill={isBookmarked ? 'currentColor' : 'none'}
                  />
                  <span>{isBookmarked ? t.bookmarked : t.bookmark}</span>
                </button>

                <ShareMenu figure={figure} variant="modal" />
              </div>
            </div>
          </div>

          <DislikeHistoryChart figure={figure} dislikeEvents={dislikeEvents} />

          <section className="bg-[#111116] border border-zinc-800 rounded-lg p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#EAE6DF] inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-red-400" />
                <span>{t.wikiSectionTitle}</span>
              </h3>
              {wiki && isSafeHttpUrl(wiki.url) && (
                <a
                  href={wiki.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-red-400 hover:text-red-300 hover:underline inline-flex items-center gap-1"
                >
                  <span>{t.viewOnSource(wiki.sourceName)}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {wikiLoading && (
              <div className="flex items-center gap-2 text-sm text-zinc-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.wikiLoading}</span>
              </div>
            )}

            {wikiError && !wikiLoading && (
              <p className="text-sm text-zinc-400 py-2">{wikiError}</p>
            )}

            {wiki && !wikiLoading && (
              <div className="dn-ink-reveal space-y-2">
                {wiki.description && (
                  <p className="text-xs text-zinc-400">{wiki.description}</p>
                )}
                <p
                  dir={wiki.lang === 'fa' || wiki.lang === 'ar' ? 'rtl' : 'ltr'}
                  className="text-sm text-zinc-200 leading-7 tracking-[0.01em]"
                >
                  {wiki.extract}
                </p>
              </div>
            )}
          </section>

          <section className="bg-[#111116] border border-zinc-800 rounded-lg p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#EAE6DF] inline-flex items-center gap-2">
                  <SearchCheck className="w-4 h-4 text-red-400" />
                  <span>{t.aiReportTitle}</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">{t.aiReportSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={handleDeepResearch}
                disabled={aiLoading}
                className="min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium bg-[#EAE6DF] text-[#060608] hover:bg-white disabled:opacity-60 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {aiLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{aiResult ? t.aiReportRefreshBtn : t.aiReportBtn}</span>
              </button>
            </div>

            {aiError && <p className="text-xs text-red-400">{aiError}</p>}

            {aiResult && (
              <div className="dn-ink-reveal space-y-4 pt-2 border-t border-zinc-800">
                <p className="text-sm text-zinc-200 leading-7">{aiResult.summary}</p>
                {aiResult.perspectives.length > 0 && (
                  <ul className="space-y-2 text-sm text-zinc-300 list-disc list-inside">
                    {aiResult.perspectives.map((item, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                {aiResult.sources.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800">
                    <div className="text-xs font-medium text-zinc-400 mb-2">
                      {t.referencedSources}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {aiResult.sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-red-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{src.title}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
