import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  Clock,
  Info,
  LayoutGrid,
  List,
  ListOrdered,
  Scale,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { DislikeEvent, FigureSuggestion, RankedFigure, VotePolicyState } from './types';
import {
  CATEGORIES,
  computeCategoryBreakdown,
  filterFigures,
  MAX_VOTE_CHANGES,
} from './utils/ranking';
import { useLanguage } from './contexts/LanguageContext';
import { getDisplayName, translateCategory } from './utils/i18n';
import { LanguageSelector } from './components/LanguageSelector';
import { FigureCard } from './components/FigureCard';
import { FigureListRow } from './components/FigureListRow';
import { FigureDetailModal } from './components/FigureDetailModal';
import { ComparePanel } from './components/ComparePanel';
import { CommunitySuggestionsSection } from './components/CommunitySuggestionsSection';
import { SuggestionModal } from './components/SuggestionModal';
import { AdminConsole } from './components/AdminConsole';
import { VoteConfirmModal } from './components/VoteConfirmModal';
import { VoteRecordedOverlay } from './components/VoteRecordedOverlay';

type PublicSection = 'directory' | 'suggestions' | 'bookmarks' | 'compare' | 'about';
type ViewMode = 'list' | 'cards';

const INITIAL_PAGE_SIZE = 40;

const DEFAULT_VOTE_POLICY: VotePolicyState = {
  totalSelections: 0,
  changesUsed: 0,
  remainingChanges: MAX_VOTE_CHANGES,
  maxChanges: MAX_VOTE_CHANGES,
  lockedUntil: 0,
  lastSelectedAt: 0,
};

function getOrCreateVisitorId(): string {
  const key = 'tarazo_visitor_id';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const generated = `v-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return 'v-anonymous';
  }
}

export default function App() {
  const { lang, t, formatNumber } = useLanguage();
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(
    () => window.location.pathname === '/admin'
  );
  const [section, setSection] = useState<PublicSection>('directory');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [figures, setFigures] = useState<RankedFigure[]>([]);
  const [dislikeEvents, setDislikeEvents] = useState<DislikeEvent[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const [suggestions, setSuggestions] = useState<FigureSuggestion[]>([]);
  const [votedSuggestionIds, setVotedSuggestionIds] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(true);

  const [category, setCategory] = useState<string>('همه');
  const [search, setSearch] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(INITIAL_PAGE_SIZE);
  const [loading, setLoading] = useState<boolean>(true);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voteNotice, setVoteNotice] = useState<string | null>(null);

  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [suggestionOpen, setSuggestionOpen] = useState<boolean>(false);
  const [votePolicy, setVotePolicy] = useState<VotePolicyState>(DEFAULT_VOTE_POLICY);
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState<boolean>(false);
  const [writeOverlayFigure, setWriteOverlayFigure] = useState<RankedFigure | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const visitorId = useMemo(() => getOrCreateVisitorId(), []);
  const ryukLayerRef = useRef<HTMLDivElement | null>(null);
  const ryukBackdropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isAdminRoute) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let currentY = 0;
    let targetY = 0;

    const computeTargetY = () => {
      if (prefersReduced) {
        return 0;
      }
      const docHeight = Math.max(
        900,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const progress = Math.min(1, Math.max(0, window.scrollY / Math.min(docHeight, 2200)));
      // Starts at 0px and smoothly glides upward to -180px while always covering full width & height
      return -progress * 180;
    };

    const applyTransform = (y: number) => {
      const el = ryukLayerRef.current;
      if (el) {
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      }
      if (ryukBackdropRef.current) {
        ryukBackdropRef.current.dataset.scrollY = String(Math.round(y));
      }
    };

    targetY = computeTargetY();
    currentY = targetY;
    applyTransform(currentY);

    const tick = () => {
      const diff = targetY - currentY;
      if (Math.abs(diff) < 0.25) {
        currentY = targetY;
        applyTransform(currentY);
        rafId = 0;
        return;
      }
      currentY += diff * 0.14;
      applyTransform(currentY);
      rafId = window.requestAnimationFrame(tick);
    };

    const onScroll = () => {
      targetY = computeTargetY();
      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isAdminRoute]);

  const navigateAdmin = useCallback((open: boolean) => {
    const nextPath = open ? '/admin' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setIsAdminRoute(open);
  }, []);

  useEffect(() => {
    const handlePop = () => {
      setIsAdminRoute(window.location.pathname === '/admin');
    };
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        navigateAdmin(!isAdminRoute);
      }
    };
    window.addEventListener('popstate', handlePop);
    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('keydown', handleShortcut);
    };
  }, [isAdminRoute, navigateAdmin]);

  const loadDirectory = useCallback(async () => {
    try {
      setError(null);
      const [figRes, sugRes] = await Promise.all([
        fetch('/api/figures', {
          credentials: 'same-origin',
          headers: { 'X-Client-Id': visitorId },
        }),
        fetch('/api/suggestions', {
          credentials: 'same-origin',
          headers: { 'X-Client-Id': visitorId },
        }),
      ]);
      if (!figRes.ok) {
        throw new Error(t.fetchError);
      }
      const figData = (await figRes.json()) as {
        figures: RankedFigure[];
        votedIds: string[];
        votePolicy?: VotePolicyState;
        bookmarkedIds: string[];
        dislikeEvents?: DislikeEvent[];
      };
      setFigures(figData.figures ?? []);
      setVotedIds((figData.votedIds ?? []).slice(0, 1));
      if (figData.votePolicy) {
        setVotePolicy(figData.votePolicy);
      }
      setBookmarkedIds(figData.bookmarkedIds ?? []);
      setDislikeEvents(figData.dislikeEvents ?? []);

      if (sugRes.ok) {
        const sugData = (await sugRes.json()) as {
          suggestions?: FigureSuggestion[];
          votedSuggestionIds?: string[];
        };
        setSuggestions(sugData.suggestions ?? []);
        setVotedSuggestionIds(sugData.votedSuggestionIds ?? []);
      }
    } catch (err) {
      setError(lang === 'fa' && err instanceof Error ? err.message : t.fetchError);
    } finally {
      setLoading(false);
      setSuggestionsLoading(false);
    }
  }, [visitorId, lang, t.fetchError]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    setNowMs(Date.now());
    if (!votePolicy.lockedUntil || votePolicy.lockedUntil <= Date.now()) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, [votePolicy.lockedUntil]);

  useEffect(() => {
    setVisibleLimit(INITIAL_PAGE_SIZE);
  }, [category, search, section]);

  const formatCooldownRemaining = useCallback(
    (lockedUntilMs: number, currentMs: number) => {
      const remMs = Math.max(0, lockedUntilMs - currentMs);
      const totalMins = Math.max(1, Math.ceil(remMs / 60000));
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      return t.cooldownFormat(formatNumber(hours), formatNumber(mins));
    },
    [t, formatNumber]
  );

  const isCooldownLocked = votePolicy.lockedUntil > nowMs;
  const changesExhausted =
    votePolicy.totalSelections >= 1 && votePolicy.remainingChanges <= 0;

  const requestVoteAction = (id: string) => {
    setVoteNotice(null);
    const target = figures.find((f) => f.id === id);
    if (!target) return;
    const isCurrentlyVoted = votedIds.includes(id);

    const currentNow = Date.now();
    setNowMs(currentNow);
    if (votePolicy.lockedUntil > currentNow) {
      setVoteNotice(t.cooldownActiveError(formatCooldownRemaining(votePolicy.lockedUntil, currentNow)));
      return;
    }

    if (!isCurrentlyVoted && votePolicy.totalSelections >= 1 && votePolicy.remainingChanges <= 0) {
      setVoteNotice(t.changesExhaustedBanner);
      return;
    }

    setConfirmTargetId(id);
  };

  const executeConfirmedVote = async (id: string) => {
    setVoteNotice(null);
    setConfirmSubmitting(true);
    try {
      const res = await fetch(`/api/figures/${id}/dislike`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Client-Id': visitorId },
      });
      const data = (await res.json().catch(() => ({}))) as {
        action?: 'added' | 'removed' | 'switched';
        reason?: string;
        figures?: RankedFigure[];
        votedIds?: string[];
        votePolicy?: VotePolicyState;
        dislikeEvents?: DislikeEvent[];
        error?: string;
      };
      if (data.votePolicy) {
        setVotePolicy(data.votePolicy);
      }
      if (res.status === 409 || res.status === 429) {
        if (data.reason === 'cooldown' && data.votePolicy?.lockedUntil) {
          setVoteNotice(
            t.cooldownActiveError(
              formatCooldownRemaining(data.votePolicy.lockedUntil, Date.now())
            )
          );
        } else if (data.reason === 'exhausted') {
          setVoteNotice(t.changesExhaustedBanner);
        } else {
          setVoteNotice((lang === 'fa' ? data.error : undefined) || data.error || t.voteConflictDefault);
        }
        if (data.votedIds) {
          setVotedIds(data.votedIds.slice(0, 1));
        }
        setConfirmTargetId(null);
        return;
      }
      if (!res.ok) {
        setConfirmTargetId(null);
        return;
      }
      if (data.figures) setFigures(data.figures);
      if (data.votedIds) setVotedIds(data.votedIds.slice(0, 1));
      if (data.dislikeEvents) setDislikeEvents(data.dislikeEvents);

      setConfirmTargetId(null);

      if (data.action === 'added' || data.action === 'switched') {
        const written = (data.figures ?? figures).find((f) => f.id === id) ?? null;
        if (written) {
          setWriteOverlayFigure(written);
        }
      }
    } catch {
      setConfirmTargetId(null);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleVoteSuggestion = async (id: string) => {
    setVoteNotice(null);
    setInfoNotice(null);
    try {
      const res = await fetch(`/api/suggestions/${id}/vote`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Client-Id': visitorId },
      });
      const data = (await res.json().catch(() => ({}))) as {
        reachedThresholdNow?: boolean;
        suggestion?: FigureSuggestion;
        suggestions?: FigureSuggestion[];
        votedSuggestionIds?: string[];
        error?: string;
      };
      if (res.status === 409) {
        setVoteNotice((lang === 'fa' ? data.error : undefined) || t.suggestionConflictDefault);
        return;
      }
      if (!res.ok) return;
      if (data.suggestions) setSuggestions(data.suggestions);
      if (data.votedSuggestionIds) setVotedSuggestionIds(data.votedSuggestionIds);
      if (data.reachedThresholdNow && data.suggestion) {
        setInfoNotice(
          t.suggestionThresholdReached(getDisplayName(data.suggestion, lang))
        );
      }
    } catch {
      // Keep current state on transient network failure
    }
  };

  const handleBookmark = async (id: string) => {
    try {
      const res = await fetch(`/api/figures/${id}/bookmark`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Client-Id': visitorId },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { bookmarkedIds: string[] };
      setBookmarkedIds(data.bookmarkedIds);
    } catch {
      // Keep current state on transient network failure
    }
  };

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleSelectComparePair = (slot: 0 | 1, id: string) => {
    setCompareIds((prev) => {
      const next = [
        prev[0] ?? figures[0]?.id ?? '',
        prev[1] ?? figures[1]?.id ?? '',
      ];
      next[slot] = id;
      return next;
    });
  };

  const filteredFigures = useMemo(
    () =>
      filterFigures(figures, {
        category,
        search,
        onlyBookmarked: section === 'bookmarks',
        bookmarkedIds,
      }),
    [figures, category, search, section, bookmarkedIds]
  );

  const visibleFigures = useMemo(
    () => filteredFigures.slice(0, visibleLimit),
    [filteredFigures, visibleLimit]
  );

  const categoryStats = useMemo(() => computeCategoryBreakdown(figures), [figures]);
  const totalVotes = useMemo(
    () => figures.reduce((sum, f) => sum + f.dislikes, 0),
    [figures]
  );

  const selectedFigure = useMemo(
    () => figures.find((f) => f.id === selectedFigureId) ?? null,
    [figures, selectedFigureId]
  );

  const chosenFigure = useMemo(
    () => (votedIds[0] ? figures.find((f) => f.id === votedIds[0]) ?? null : null),
    [figures, votedIds]
  );

  const confirmTargetFigure = useMemo(
    () => (confirmTargetId ? figures.find((f) => f.id === confirmTargetId) ?? null : null),
    [figures, confirmTargetId]
  );

  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-[#060608] text-[#EAE6DF]">
        <AdminConsole
          onExit={() => navigateAdmin(false)}
          onDirectoryChanged={loadDirectory}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#060608] text-[#EAE6DF] pb-20 md:pb-0">
      {/* Full-Width Ryuk Backdrop (5% Opacity, Smooth Upward Scroll Parallax) */}
      <div
        ref={ryukBackdropRef}
        aria-hidden="true"
        data-testid="ryuk-backdrop"
        data-scroll-y="0"
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      >
        <div
          ref={ryukLayerRef}
          className="w-full h-[124vh] opacity-[0.05] will-change-transform"
          style={{
            transform: 'translate3d(0, 0px, 0)',
          }}
        >
          <img
            src="/assets/aistudio/1b6cfcfb-7172-478f-82b7-4aba12981f6e_2c00d7a8.png"
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-[center_22%]"
          />
        </div>
      </div>

      {/* Top Navigation (Strict 3-Zone Contract + Corner Language Selector) */}
      <header className="sticky top-0 z-30 bg-[#060608]/92 backdrop-blur-sm border-b border-zinc-800/90">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setSection('directory');
            }}
            className="font-editorial text-base sm:text-xl font-bold tracking-tight text-[#EAE6DF] whitespace-nowrap shrink-0"
          >
            {t.brandName}
          </a>

          <nav
            aria-label={t.navAriaLabel}
            className="hidden md:flex items-center gap-4 lg:gap-5 text-sm font-medium text-zinc-400"
          >
            <button
              type="button"
              onClick={() => setSection('directory')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                section === 'directory'
                  ? 'border-[#DC2626] text-[#EAE6DF]'
                  : 'border-transparent hover:text-[#EAE6DF]'
              }`}
            >
              {t.navDirectory}
            </button>
            <button
              type="button"
              onClick={() => setSection('suggestions')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                section === 'suggestions'
                  ? 'border-[#DC2626] text-[#EAE6DF]'
                  : 'border-transparent hover:text-[#EAE6DF]'
              }`}
            >
              {t.navSuggestions} ({formatNumber(suggestions.length)})
            </button>
            <button
              type="button"
              onClick={() => setSection('bookmarks')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                section === 'bookmarks'
                  ? 'border-[#DC2626] text-[#EAE6DF]'
                  : 'border-transparent hover:text-[#EAE6DF]'
              }`}
            >
              {t.navBookmarks} ({formatNumber(bookmarkedIds.length)})
            </button>
            <button
              type="button"
              onClick={() => setSection('compare')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                section === 'compare'
                  ? 'border-[#DC2626] text-[#EAE6DF]'
                  : 'border-transparent hover:text-[#EAE6DF]'
              }`}
            >
              {t.navCompare}
            </button>
            <button
              type="button"
              onClick={() => setSection('about')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                section === 'about'
                  ? 'border-[#DC2626] text-[#EAE6DF]'
                  : 'border-transparent hover:text-[#EAE6DF]'
              }`}
            >
              {t.navAbout}
            </button>
          </nav>

          <div className="shrink-0 flex items-center gap-2">
            <LanguageSelector />
            <button
              type="button"
              onClick={() => setSuggestionOpen(true)}
              className="min-h-[40px] px-3 sm:px-4 py-2 rounded-md bg-[#B91C1C] text-white text-xs sm:text-sm font-medium hover:bg-[#991B1B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.suggestFigureBtn}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5">
        {/* Compact header & question */}
        <section className="dn-ink-reveal border-b border-zinc-800/90 pb-4 space-y-2.5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <p className="text-xs font-medium text-red-400">
                {t.ruleEyebrow}
              </p>
              <h1 className="font-editorial text-xl sm:text-3xl font-bold text-[#EAE6DF] leading-snug">
                {t.heroSlogan}
              </h1>
              <ul
                data-testid="hero-rules-list"
                className="text-xs sm:text-sm text-zinc-400 leading-relaxed space-y-1 list-none p-0 m-0"
              >
                {t.heroRules
                  .split(/\s*·\s*/)
                  .filter(Boolean)
                  .map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
              </ul>
            </div>

            <div className="flex items-center gap-5 text-xs text-zinc-400 shrink-0 tabular-nums">
              <div>
                <span className="text-zinc-500 block">{t.totalFiguresLabel}</span>
                <span className="font-bold text-[#EAE6DF] text-base sm:text-lg">
                  {formatNumber(figures.length)}
                </span>
              </div>
              <div className="h-7 w-px bg-zinc-800" aria-hidden="true" />
              <div>
                <span className="text-zinc-500 block">{t.totalVotesLabel}</span>
                <span className="font-bold text-red-400 text-base sm:text-lg">
                  {formatNumber(totalVotes)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {t.neutralityNote}
          </p>
        </section>

        {/* Active Single-Choice Banner, 48h Lock & Quota Status, or Conflict Notice */}
        {(chosenFigure || voteNotice || infoNotice || votePolicy.totalSelections > 0) && (
          <section
            data-testid="active-vote-banner"
            role={voteNotice ? 'alert' : 'status'}
            aria-live="polite"
            className={`rounded-lg px-4 py-2.5 border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm ${
              voteNotice
                ? 'bg-red-950/45 border-red-800/80 text-red-200'
                : 'bg-[#0E0E12] border-zinc-800 text-zinc-200'
            }`}
          >
            <div className="space-y-1 flex-1 min-w-[200px]">
              {voteNotice && <p className="font-medium text-red-300">{voteNotice}</p>}
              {infoNotice && !voteNotice && (
                <p className="text-xs text-zinc-300">{infoNotice}</p>
              )}
              {chosenFigure && (
                <p>
                  {t.chosenNamePrefix}{' '}
                  <strong className="text-red-400 font-semibold">
                    {getDisplayName(chosenFigure, lang)}
                  </strong>{' '}
                  <span className="text-zinc-400">
                    ({t.rankLabel} #{formatNumber(chosenFigure.rank)})
                  </span>
                </p>
              )}
              {votePolicy.totalSelections > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-zinc-400 tabular-nums">
                  {isCooldownLocked && (
                    <span className="inline-flex items-center gap-1 text-red-300 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {t.cooldownLockedBanner(
                          formatCooldownRemaining(votePolicy.lockedUntil, nowMs)
                        )}
                      </span>
                    </span>
                  )}
                  <span>
                    {changesExhausted
                      ? t.changesExhaustedBanner
                      : t.changesRemainingBanner(
                          formatNumber(votePolicy.remainingChanges),
                          formatNumber(votePolicy.maxChanges)
                        )}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {chosenFigure && (
                <button
                  type="button"
                  onClick={() => requestVoteAction(chosenFigure.id)}
                  className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#16161B] border border-zinc-700 text-xs font-medium text-[#EAE6DF] hover:bg-zinc-800 cursor-pointer"
                >
                  {isCooldownLocked ? t.locked48hShort : t.cancelSelection}
                </button>
              )}
              {(voteNotice || infoNotice) && (
                <button
                  type="button"
                  onClick={() => {
                    setVoteNotice(null);
                    setInfoNotice(null);
                  }}
                  aria-label={t.closeAlert}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </section>
        )}

        {section === 'suggestions' && (
          <CommunitySuggestionsSection
            suggestions={suggestions}
            votedSuggestionIds={votedSuggestionIds}
            loading={suggestionsLoading}
            onVoteSuggestion={handleVoteSuggestion}
            onOpenSubmitModal={() => setSuggestionOpen(true)}
          />
        )}

        {section === 'compare' && (
          <ComparePanel
            figures={figures}
            dislikeEvents={dislikeEvents}
            selectedIds={compareIds}
            onSelectPair={handleSelectComparePair}
            onClear={() => setCompareIds([])}
          />
        )}

        {section === 'about' && (
          <section className="bg-[#0D0D11] border border-zinc-800 rounded-lg p-6 max-w-3xl space-y-4">
            <h2 className="font-editorial text-2xl font-bold text-[#EAE6DF]">
              {t.aboutTitle}
            </h2>
            <p className="text-sm sm:text-base text-zinc-300 leading-8">
              {t.aboutP1}
            </p>
            <p className="text-sm sm:text-base text-zinc-300 leading-8">
              {t.aboutP2}
            </p>
          </section>
        )}

        {(section === 'directory' || section === 'bookmarks') && (
          <>
            {/* Compact Search, Category Filter & List/Card View Switch */}
            <section className="space-y-2.5">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-zinc-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label={t.searchAriaLabel}
                    placeholder={t.searchPlaceholder}
                    className="w-full min-h-[40px] ps-9 pe-3 py-1.5 bg-[#0D0D11] border border-zinc-800 rounded-md text-xs sm:text-sm text-[#EAE6DF] placeholder:text-zinc-500 focus:outline-2 focus:outline-red-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label={t.viewModeAria}
                    className="inline-flex items-center gap-1 p-1 bg-[#0D0D11] border border-zinc-800 rounded-md"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      aria-pressed={viewMode === 'list'}
                      className={`min-h-[34px] px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        viewMode === 'list'
                          ? 'bg-[#B91C1C] text-white'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>{t.viewList}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      aria-pressed={viewMode === 'cards'}
                      className={`min-h-[34px] px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        viewMode === 'cards'
                          ? 'bg-[#B91C1C] text-white'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>{t.viewCards}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {['همه', ...CATEGORIES].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      category === cat
                        ? 'bg-[#EAE6DF] text-[#060608]'
                        : 'bg-[#0D0D11] border border-zinc-800 text-zinc-300 hover:bg-zinc-800/80'
                    }`}
                  >
                    {translateCategory(cat, lang)}
                  </button>
                ))}
              </div>
            </section>

            {/* Compare Quick Banner when 1 or 2 figures are picked */}
            {compareIds.length > 0 && (
              <div className="bg-[#0D0D11] border border-zinc-800 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs sm:text-sm text-zinc-300">
                  {t.compareBannerCount(formatNumber(compareIds.length))}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSection('compare')}
                    className="min-h-[36px] px-3 py-1 rounded-md bg-[#EAE6DF] text-[#060608] text-xs font-medium cursor-pointer"
                  >
                    {t.viewCompare}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareIds([])}
                    className="min-h-[36px] px-3 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
                  >
                    {t.clear}
                  </button>
                </div>
              </div>
            )}

            {/* Main Directory List */}
            {loading ? (
              <div className="py-16 text-center text-sm text-zinc-400">
                {t.loadingList}
              </div>
            ) : error ? (
              <div className="bg-[#0D0D11] border border-zinc-800 rounded-lg p-8 text-center space-y-3">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={loadDirectory}
                  className="min-h-[44px] px-4 py-2 rounded-md bg-[#EAE6DF] text-[#060608] text-sm cursor-pointer"
                >
                  {t.retry}
                </button>
              </div>
            ) : filteredFigures.length === 0 ? (
              <div className="bg-[#0D0D11] border border-zinc-800 rounded-lg p-10 text-center space-y-2">
                <p className="text-base font-medium text-[#EAE6DF]">
                  {section === 'bookmarks'
                    ? t.emptyBookmarksTitle
                    : t.emptyFilterTitle}
                </p>
                <p className="text-xs text-zinc-500">
                  {section === 'bookmarks'
                    ? t.emptyBookmarksHint
                    : t.emptyFilterHint}
                </p>
              </div>
            ) : (
              <>
                {viewMode === 'list' ? (
                  <section
                    aria-label={t.listAriaLabel}
                    className="border border-zinc-800/90 rounded-lg divide-y divide-zinc-800/80 shadow-2xl"
                  >
                    <div className="px-4 sm:px-5 py-2.5 bg-[#09090C] rounded-t-lg flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                      <span className="font-medium text-zinc-300">
                        {t.listCount(formatNumber(filteredFigures.length))}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="hidden md:inline text-zinc-500">
                          {t.listClickHint}
                        </span>
                      </div>
                    </div>

                    {visibleFigures.map((fig, index) => (
                      <FigureListRow
                        key={fig.id}
                        figure={fig}
                        index={index}
                        isVoted={votedIds.includes(fig.id)}
                        hasActiveVote={votedIds.length > 0}
                        isCooldownLocked={isCooldownLocked}
                        changesExhausted={changesExhausted}
                        isBookmarked={bookmarkedIds.includes(fig.id)}
                        isCompared={compareIds.includes(fig.id)}
                        onDislike={requestVoteAction}
                        onBookmark={handleBookmark}
                        onToggleCompare={handleToggleCompare}
                        onSelect={(item) => setSelectedFigureId(item.id)}
                      />
                    ))}
                  </section>
                ) : (
                  <div className="space-y-4">
                    {visibleFigures.map((fig, index) => (
                      <FigureCard
                        key={fig.id}
                        figure={fig}
                        index={index}
                        featured={
                          index === 0 &&
                          section === 'directory' &&
                          category === 'همه' &&
                          !search
                        }
                        isVoted={votedIds.includes(fig.id)}
                        hasActiveVote={votedIds.length > 0}
                        isCooldownLocked={isCooldownLocked}
                        changesExhausted={changesExhausted}
                        isBookmarked={bookmarkedIds.includes(fig.id)}
                        isCompared={compareIds.includes(fig.id)}
                        onDislike={requestVoteAction}
                        onBookmark={handleBookmark}
                        onToggleCompare={handleToggleCompare}
                        onSelect={(item) => setSelectedFigureId(item.id)}
                      />
                    ))}
                  </div>
                )}

                {filteredFigures.length > visibleFigures.length && (
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + 40)}
                      className="min-h-[44px] px-5 py-2 rounded-lg bg-[#111116] border border-zinc-800 text-sm font-medium text-[#EAE6DF] hover:bg-zinc-800 inline-flex items-center gap-2 cursor-pointer"
                    >
                      <ChevronDown className="w-4 h-4" />
                      <span>
                        {t.showNextBtn(
                          formatNumber(Math.min(40, filteredFigures.length - visibleFigures.length))
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleLimit(filteredFigures.length)}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-zinc-800 text-xs sm:text-sm text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      {t.showAllBtn(formatNumber(filteredFigures.length))}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Compact Category Distribution Strip */}
            {figures.length > 0 && (
              <section
                aria-label={t.categoryDistAria}
                className="bg-[#0D0D11] border border-zinc-800/90 rounded-lg p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <span className="font-medium text-zinc-200">
                    {t.categoryDistributionTitle}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 tabular-nums">
                    {categoryStats.map((stat, idx) => {
                      const colors = [
                        'bg-[#DC2626]',
                        'bg-[#991B1B]',
                        'bg-[#B45309]',
                        'bg-zinc-300',
                        'bg-zinc-500',
                        'bg-zinc-700',
                      ];
                      const catLabel = translateCategory(stat.category, lang);
                      return (
                        <span key={stat.category} className="inline-flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-xs shrink-0 ${colors[idx % colors.length]}`}
                            aria-hidden="true"
                          />
                          <span>
                            {catLabel}: {formatNumber(stat.sharePercent)}%
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden flex">
                  {categoryStats.map((stat, idx) => {
                    const colors = [
                      'bg-[#DC2626]',
                      'bg-[#991B1B]',
                      'bg-[#B45309]',
                      'bg-zinc-300',
                      'bg-zinc-500',
                      'bg-zinc-700',
                    ];
                    const catLabel = translateCategory(stat.category, lang);
                    return (
                      <div
                        key={stat.category}
                        className={`${colors[idx % colors.length]} h-full transition-[width] duration-200`}
                        style={{ width: `${stat.sharePercent}%` }}
                        title={`${catLabel}: ${stat.sharePercent}%`}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Quiet Anonymous Footer */}
      <footer className="relative z-10 border-t border-zinc-800/80 bg-[#08080A]/90 py-5 mt-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>{t.footerLeft}</span>
          <span>{t.footerRight}</span>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Fixed <= 56px) */}
      <nav
        aria-label={t.mobileNavAriaLabel}
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#060608]/95 backdrop-blur-md border-t border-zinc-800 grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => setSection('directory')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
            section === 'directory' ? 'text-red-400' : 'text-zinc-400'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          <span>{t.mobileDirectory}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('suggestions')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
            section === 'suggestions' ? 'text-red-400' : 'text-zinc-400'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t.mobileSuggestions}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('bookmarks')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
            section === 'bookmarks' ? 'text-red-400' : 'text-zinc-400'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>{t.mobileBookmarks}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('compare')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
            section === 'compare' ? 'text-red-400' : 'text-zinc-400'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>{t.mobileCompare}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('about')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
            section === 'about' ? 'text-red-400' : 'text-zinc-400'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>{t.mobileAbout}</span>
        </button>
      </nav>

      <FigureDetailModal
        figure={selectedFigure}
        dislikeEvents={dislikeEvents}
        isVoted={selectedFigure ? votedIds.includes(selectedFigure.id) : false}
        hasActiveVote={votedIds.length > 0}
        isCooldownLocked={isCooldownLocked}
        changesExhausted={changesExhausted}
        isBookmarked={selectedFigure ? bookmarkedIds.includes(selectedFigure.id) : false}
        voteNotice={voteNotice}
        onClose={() => setSelectedFigureId(null)}
        onDislike={requestVoteAction}
        onBookmark={handleBookmark}
      />

      <VoteConfirmModal
        targetFigure={confirmTargetFigure}
        currentChosenFigure={chosenFigure}
        votePolicy={votePolicy}
        submitting={confirmSubmitting}
        onConfirm={executeConfirmedVote}
        onCancel={() => setConfirmTargetId(null)}
      />

      <VoteRecordedOverlay
        figure={writeOverlayFigure}
        votePolicy={votePolicy}
        onClose={() => setWriteOverlayFigure(null)}
      />

      <SuggestionModal
        open={suggestionOpen}
        visitorId={visitorId}
        onClose={() => setSuggestionOpen(false)}
        onSubmitted={(nextSuggestions, nextVotedIds) => {
          setSuggestions(nextSuggestions);
          setVotedSuggestionIds(nextVotedIds);
          setSection('suggestions');
        }}
      />
    </div>
  );
}
