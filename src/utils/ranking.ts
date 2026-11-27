import type {
  CategoryStat,
  DislikeEvent,
  FigureCategory,
  FigureInput,
  FigureSuggestion,
  PublicFigure,
  RankedFigure,
  TrendDirection,
  VotePolicyState,
} from '../types';

export const CATEGORIES: FigureCategory[] = [
  'سیاسی',
  'نظامی و جنگ‌افروز',
  'رهبران مذهبی',
  'فناوری و رسانه',
  'سلبریتی',
  'ورزشکار',
];

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const VOTE_COOLDOWN_HOURS = 48;
export const VOTE_COOLDOWN_MS = VOTE_COOLDOWN_HOURS * 60 * 60 * 1000;
export const MAX_VOTE_CHANGES = 5;

export function getTrendDirection(change24h: number): TrendDirection {
  if (change24h > 0) return 'up';
  if (change24h < 0) return 'down';
  return 'flat';
}

export function compute24hChanges(
  events: DislikeEvent[],
  nowMs: number = Date.now()
): Record<string, number> {
  const cutoff = nowMs - TWENTY_FOUR_HOURS_MS;
  const changes: Record<string, number> = {};
  for (const ev of events) {
    if (ev.ts >= cutoff && ev.ts <= nowMs && Number.isFinite(ev.delta)) {
      changes[ev.figureId] = (changes[ev.figureId] ?? 0) + ev.delta;
    }
  }
  return changes;
}

export function sortFiguresByDislikes(
  figures: PublicFigure[],
  dislikeEvents: DislikeEvent[] = [],
  nowMs: number = Date.now()
): RankedFigure[] {
  const totalDislikes = figures.reduce((sum, f) => sum + Math.max(0, f.dislikes), 0);
  const changes24h = compute24hChanges(dislikeEvents, nowMs);

  const sorted = [...figures].sort((a, b) => {
    if (b.dislikes !== a.dislikes) {
      return b.dislikes - a.dislikes;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  return sorted.map((figure, index) => {
    const change24h = changes24h[figure.id] ?? 0;
    return {
      ...figure,
      rank: index + 1,
      sharePercent:
        totalDislikes > 0
          ? Math.round((Math.max(0, figure.dislikes) / totalDislikes) * 1000) / 10
          : 0,
      change24h,
      trend24h: getTrendDirection(change24h),
    };
  });
}

export function filterFigures(
  figures: RankedFigure[],
  options: {
    category?: string;
    search?: string;
    onlyBookmarked?: boolean;
    bookmarkedIds?: string[];
  }
): RankedFigure[] {
  const category = options.category ?? 'همه';
  const query = (options.search ?? '').trim().toLowerCase();
  const bookmarkedSet = new Set(options.bookmarkedIds ?? []);

  return figures.filter((item) => {
    if (category !== 'همه' && item.category !== category) {
      return false;
    }
    if (options.onlyBookmarked && !bookmarkedSet.has(item.id)) {
      return false;
    }
    if (query) {
      const haystack = `${item.name} ${item.englishName} ${item.country} ${item.shortBio} ${item.category}`.toLowerCase();
      return haystack.includes(query);
    }
    return true;
  });
}

export function computeCategoryBreakdown(figures: PublicFigure[]): CategoryStat[] {
  const totalDislikes = figures.reduce((sum, f) => sum + Math.max(0, f.dislikes), 0);

  return CATEGORIES.map((category) => {
    const items = figures.filter((f) => f.category === category);
    const catDislikes = items.reduce((sum, f) => sum + Math.max(0, f.dislikes), 0);
    return {
      category,
      count: items.length,
      totalDislikes: catDislikes,
      sharePercent:
        totalDislikes > 0 ? Math.round((catDislikes / totalDislikes) * 1000) / 10 : 0,
    };
  });
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }
  return false;
}

export function isSafeHttpUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string' || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function validateFigureInput(input: Partial<FigureInput>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 120) {
    errors.name = 'نام چهره باید بین ۲ تا ۱۲۰ کاراکتر باشد.';
  }
  if (
    input.englishName !== undefined &&
    (typeof input.englishName !== 'string' || input.englishName.trim().length > 120)
  ) {
    errors.englishName = 'نام انگلیسی نامعتبر است.';
  }
  if (!input.category || !CATEGORIES.includes(input.category)) {
    errors.category = 'دسته‌بندی معتبر را انتخاب کنید.';
  }
  if (
    typeof input.country !== 'string' ||
    input.country.trim().length < 2 ||
    input.country.trim().length > 100
  ) {
    errors.country = 'نام کشور یا حوزه فعالیت باید بین ۲ تا ۱۰۰ کاراکتر باشد.';
  }
  if (
    typeof input.shortBio !== 'string' ||
    input.shortBio.trim().length < 10 ||
    input.shortBio.trim().length > 600
  ) {
    errors.shortBio = 'بیوگرافی کوتاه باید بین ۱۰ تا ۶۰۰ کاراکتر باشد.';
  }
  if (input.dislikes !== undefined && (!Number.isFinite(input.dislikes) || input.dislikes < 0)) {
    errors.dislikes = 'تعداد دیس‌لایک نمی‌تواند منفی باشد.';
  }
  if (input.imageUrl !== undefined && input.imageUrl !== null) {
    if (typeof input.imageUrl !== 'string') {
      errors.imageUrl = 'نشانی تصویر معتبر نیست.';
    } else if (input.imageUrl.trim().length > 0) {
      const url = input.imageUrl.trim();
      const isSafeRelative =
        url.startsWith('/src/assets/') ||
        url.startsWith('/assets/') ||
        url.startsWith('/api/figures/');
      const isSafeHttp = isSafeHttpUrl(url);
      const isSafeDataImg =
        url.length <= 1_800_000 && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url);
      if (!isSafeRelative && !isSafeHttp && !isSafeDataImg) {
        errors.imageUrl = 'نشانی تصویر معتبر نیست.';
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatPersianNumber(n: number): string {
  return new Intl.NumberFormat('fa-IR').format(n);
}

export interface SingleVoteOutcome {
  ok: boolean;
  action: 'added' | 'removed' | 'switched' | 'conflict';
  nextVotedIds: string[];
  reason?: 'not_found' | 'cooldown' | 'exhausted' | 'conflict';
  nextPolicy?: VotePolicyState;
  deltaApplied?: Array<{ figureId: string; delta: number }>;
  error?: string;
}

export function buildVotePolicyState(
  raw?: Partial<{ totalSelections: number; lockedUntil: number; lastSelectedAt: number }>
): VotePolicyState {
  const totalSelections =
    typeof raw?.totalSelections === 'number' && Number.isFinite(raw.totalSelections)
      ? Math.max(0, Math.floor(raw.totalSelections))
      : 0;
  const changesUsed = Math.min(MAX_VOTE_CHANGES, Math.max(0, totalSelections - 1));
  const remainingChanges = Math.max(0, MAX_VOTE_CHANGES - changesUsed);
  const lockedUntil =
    typeof raw?.lockedUntil === 'number' && Number.isFinite(raw.lockedUntil)
      ? Math.max(0, raw.lockedUntil)
      : 0;
  const lastSelectedAt =
    typeof raw?.lastSelectedAt === 'number' && Number.isFinite(raw.lastSelectedAt)
      ? Math.max(0, raw.lastSelectedAt)
      : 0;

  return {
    totalSelections,
    changesUsed,
    remainingChanges,
    maxChanges: MAX_VOTE_CHANGES,
    lockedUntil,
    lastSelectedAt,
  };
}

export function applySingleVote(
  figures: PublicFigure[],
  currentVotedIds: string[],
  targetId: string
): SingleVoteOutcome {
  const target = figures.find((f) => f.id === targetId);
  if (!target) {
    return {
      ok: false,
      action: 'conflict',
      reason: 'not_found',
      nextVotedIds: currentVotedIds.slice(0, 1),
      error: 'چهره مورد نظر یافت نشد.',
    };
  }

  const activeId = currentVotedIds[0] ?? null;

  if (activeId === targetId) {
    target.dislikes = Math.max(0, target.dislikes - 1);
    return {
      ok: true,
      action: 'removed',
      nextVotedIds: [],
      deltaApplied: [{ figureId: targetId, delta: -1 }],
    };
  }

  if (activeId !== null) {
    return {
      ok: false,
      action: 'conflict',
      reason: 'conflict',
      nextVotedIds: [activeId],
      error: 'هر شخص فقط می‌تواند یک گزینه را انتخاب کند. برای انتخاب جدید ابتدا گزینه قبلی را لغو کنید.',
    };
  }

  target.dislikes += 1;
  return {
    ok: true,
    action: 'added',
    nextVotedIds: [targetId],
    deltaApplied: [{ figureId: targetId, delta: 1 }],
  };
}

export function applySingleVoteWithPolicy(
  figures: PublicFigure[],
  currentVotedIds: string[],
  targetId: string,
  policyInput?: Partial<{ totalSelections: number; lockedUntil: number; lastSelectedAt: number }>,
  nowMs: number = Date.now(),
  allowDirectSwitch: boolean = true
): SingleVoteOutcome {
  const policy = buildVotePolicyState(policyInput);
  const target = figures.find((f) => f.id === targetId);
  if (!target) {
    return {
      ok: false,
      action: 'conflict',
      reason: 'not_found',
      nextVotedIds: currentVotedIds.slice(0, 1),
      nextPolicy: policy,
      error: 'چهره مورد نظر یافت نشد.',
    };
  }

  const activeId = currentVotedIds[0] ?? null;
  const inCooldown = policy.lockedUntil > nowMs;
  const maxConfirmations = 1 + MAX_VOTE_CHANGES;

  if (activeId === targetId) {
    if (policy.remainingChanges <= 0) {
      return {
        ok: false,
        action: 'conflict',
        reason: 'exhausted',
        nextVotedIds: [activeId],
        nextPolicy: policy,
        error: 'شما از هر ۵ بار حق تغییر انتخاب خود استفاده کرده‌اید و این انتخاب نهایی است.',
      };
    }
    if (inCooldown) {
      return {
        ok: false,
        action: 'conflict',
        reason: 'cooldown',
        nextVotedIds: [activeId],
        nextPolicy: policy,
        error: 'تا ۴۸ ساعت پس از ثبت انتخاب امکان لغو یا تغییر وجود ندارد.',
      };
    }

    target.dislikes = Math.max(0, target.dislikes - 1);
    return {
      ok: true,
      action: 'removed',
      nextVotedIds: [],
      nextPolicy: policy,
      deltaApplied: [{ figureId: targetId, delta: -1 }],
    };
  }

  if (activeId !== null) {
    if (policy.remainingChanges <= 0) {
      return {
        ok: false,
        action: 'conflict',
        reason: 'exhausted',
        nextVotedIds: [activeId],
        nextPolicy: policy,
        error: 'شما از هر ۵ بار حق تغییر انتخاب خود استفاده کرده‌اید و دیگر امکان تغییر ندارید.',
      };
    }
    if (inCooldown) {
      return {
        ok: false,
        action: 'conflict',
        reason: 'cooldown',
        nextVotedIds: [activeId],
        nextPolicy: policy,
        error: 'انتخاب فعلی شما تا ۴۸ ساعت قفل است و امکان تغییر آن وجود ندارد.',
      };
    }
    if (!allowDirectSwitch) {
      return {
        ok: false,
        action: 'conflict',
        reason: 'conflict',
        nextVotedIds: [activeId],
        nextPolicy: policy,
        error: 'هر شخص فقط می‌تواند یک گزینه را انتخاب کند.',
      };
    }

    const prevTarget = figures.find((f) => f.id === activeId);
    const deltas: Array<{ figureId: string; delta: number }> = [];
    if (prevTarget) {
      prevTarget.dislikes = Math.max(0, prevTarget.dislikes - 1);
      deltas.push({ figureId: prevTarget.id, delta: -1 });
    }
    target.dislikes += 1;
    deltas.push({ figureId: targetId, delta: 1 });

    const nextPolicy = buildVotePolicyState({
      totalSelections: policy.totalSelections + 1,
      lockedUntil: nowMs + VOTE_COOLDOWN_MS,
      lastSelectedAt: nowMs,
    });

    return {
      ok: true,
      action: 'switched',
      nextVotedIds: [targetId],
      nextPolicy,
      deltaApplied: deltas,
    };
  }

  // activeId === null
  if (policy.totalSelections >= maxConfirmations) {
    return {
      ok: false,
      action: 'conflict',
      reason: 'exhausted',
      nextVotedIds: [],
      nextPolicy: policy,
      error: 'سقف ۵ بار تغییر انتخاب شما به پایان رسیده است.',
    };
  }
  if (inCooldown) {
    return {
      ok: false,
      action: 'conflict',
      reason: 'cooldown',
      nextVotedIds: [],
      nextPolicy: policy,
      error: 'امکان ثبت انتخاب جدید تا پایان دوره ۴۸ ساعته وجود ندارد.',
    };
  }

  target.dislikes += 1;
  const nextPolicy = buildVotePolicyState({
    totalSelections: policy.totalSelections + 1,
    lockedUntil: nowMs + VOTE_COOLDOWN_MS,
    lastSelectedAt: nowMs,
  });

  return {
    ok: true,
    action: 'added',
    nextVotedIds: [targetId],
    nextPolicy,
    deltaApplied: [{ figureId: targetId, delta: 1 }],
  };
}

export const SUGGESTION_VOTE_THRESHOLD = 1000;

export interface SuggestionVoteOutcome {
  ok: boolean;
  action: 'added' | 'removed' | 'conflict';
  nextVotedIds: string[];
  reachedThresholdNow: boolean;
  error?: string;
}

export function applySuggestionVote(
  suggestions: FigureSuggestion[],
  currentVotedIds: string[],
  targetId: string,
  nowIso: string = new Date().toISOString()
): SuggestionVoteOutcome {
  const target = suggestions.find((s) => s.id === targetId);
  if (!target) {
    return {
      ok: false,
      action: 'conflict',
      nextVotedIds: [...currentVotedIds],
      reachedThresholdNow: false,
      error: 'پیشنهاد مورد نظر یافت نشد.',
    };
  }

  const votedSet = new Set(currentVotedIds);
  if (votedSet.has(targetId)) {
    if (target.status === 'pending_admin') {
      return {
        ok: false,
        action: 'conflict',
        nextVotedIds: Array.from(votedSet),
        reachedThresholdNow: false,
        error: 'این پیشنهاد به حدنصاب ۱٬۰۰۰ رأی رسیده و به صف بررسی ادمین ارسال شده است.',
      };
    }
    target.votes = Math.max(0, target.votes - 1);
    votedSet.delete(targetId);
    return {
      ok: true,
      action: 'removed',
      nextVotedIds: Array.from(votedSet),
      reachedThresholdNow: false,
    };
  }

  target.votes += 1;
  votedSet.add(targetId);

  let reachedThresholdNow = false;
  if (target.votes >= SUGGESTION_VOTE_THRESHOLD && target.status !== 'pending_admin') {
    target.status = 'pending_admin';
    target.thresholdReachedAt = nowIso;
    reachedThresholdNow = true;
  }

  return {
    ok: true,
    action: 'added',
    nextVotedIds: Array.from(votedSet),
    reachedThresholdNow,
  };
}
