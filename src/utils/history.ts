import type {
  DislikeEvent,
  DislikeHistoryPoint,
  HistoryRange,
  PublicFigure,
} from '../types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function hashFigureId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(ts: number, locale: string = 'fa-IR'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(ts));
  } catch {
    return toDayKey(ts).slice(5);
  }
}

export function buildFigureDislikeHistory(
  figure: Pick<PublicFigure, 'id' | 'dislikes'>,
  dislikeEvents: DislikeEvent[],
  range: HistoryRange,
  nowMs: number = Date.now(),
  locale: string = 'fa-IR'
): DislikeHistoryPoint[] {
  const days = range === '7d' ? 7 : 30;
  const recordedByDay = new Map<string, number>();

  for (const ev of dislikeEvents) {
    if (ev.figureId !== figure.id || !Number.isFinite(ev.ts) || !Number.isFinite(ev.delta)) {
      continue;
    }
    const key = toDayKey(ev.ts);
    recordedByDay.set(key, (recordedByDay.get(key) ?? 0) + ev.delta);
  }

  const seed = hashFigureId(figure.id);
  const baseDailyScale = Math.max(1, Math.round(figure.dislikes * 0.009));

  const dayMeta: Array<{ dayKey: string; label: string; delta: number }> = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dayTs = nowMs - offset * ONE_DAY_MS;
    const dayKey = toDayKey(dayTs);
    const label = formatDayLabel(dayTs, locale);

    let delta: number;
    if (recordedByDay.has(dayKey)) {
      delta = recordedByDay.get(dayKey)!;
    } else if (offset === 0) {
      delta = 0;
    } else {
      // Deterministic historical baseline curve for periods before live event capture
      const wave = ((seed >> (offset % 16)) & 7) + ((offset * 3 + (seed % 5)) % 4);
      const factor = 0.45 + (wave / 10) * 0.85;
      delta = Math.max(0, Math.round(baseDailyScale * factor));
    }

    dayMeta.push({ dayKey, label, delta });
  }

  // Reconstruct cumulative values backwards from live figure.dislikes today
  const points: DislikeHistoryPoint[] = new Array(days);
  let runningTotal = Math.max(0, Math.round(figure.dislikes));

  for (let offset = 0; offset < days; offset += 1) {
    const entry = dayMeta[offset];
    const index = days - 1 - offset;
    const clampedDelta = Math.min(runningTotal, entry.delta);

    points[index] = {
      dayKey: entry.dayKey,
      label: entry.label,
      dislikes: runningTotal,
      dailyDelta: entry.delta,
    };

    runningTotal = Math.max(0, runningTotal - clampedDelta);
  }

  return points;
}

export function summarizeHistoryWindow(points: DislikeHistoryPoint[]): {
  netChange: number;
  minDislikes: number;
  maxDislikes: number;
  peakDailyDelta: number;
} {
  if (points.length === 0) {
    return { netChange: 0, minDislikes: 0, maxDislikes: 0, peakDailyDelta: 0 };
  }
  let minDislikes = points[0].dislikes;
  let maxDislikes = points[0].dislikes;
  let peakDailyDelta = points[0].dailyDelta;

  for (const p of points) {
    if (p.dislikes < minDislikes) minDislikes = p.dislikes;
    if (p.dislikes > maxDislikes) maxDislikes = p.dislikes;
    if (p.dailyDelta > peakDailyDelta) peakDailyDelta = p.dailyDelta;
  }

  return {
    netChange: points[points.length - 1].dislikes - points[0].dislikes,
    minDislikes,
    maxDislikes,
    peakDailyDelta,
  };
}

export type CompareMetricMode = 'cumulative' | 'slope_growth' | 'daily_delta';

export interface CompareMonthlyPoint {
  dayKey: string;
  label: string;
  firstTotal: number;
  secondTotal: number;
  firstGrowth: number;
  secondGrowth: number;
  firstDaily: number;
  secondDaily: number;
}

export interface CompareSlopeSummary {
  netGrowth: number;
  growthPercent: number;
  avgDailySlope: number;
  recent7dSlope: number;
  previous7dSlope: number;
  momentumDelta: number;
  momentumTrend: 'accelerating' | 'decelerating' | 'steady';
}

export function buildCompareMonthlySeries(
  first: Pick<PublicFigure, 'id' | 'dislikes'>,
  second: Pick<PublicFigure, 'id' | 'dislikes'>,
  dislikeEvents: DislikeEvent[],
  nowMs: number = Date.now(),
  locale: string = 'fa-IR'
): CompareMonthlyPoint[] {
  const firstPoints = buildFigureDislikeHistory(first, dislikeEvents, '30d', nowMs, locale);
  const secondPoints = buildFigureDislikeHistory(second, dislikeEvents, '30d', nowMs, locale);

  const firstBase = firstPoints[0]?.dislikes ?? 0;
  const secondBase = secondPoints[0]?.dislikes ?? 0;

  return firstPoints.map((pt, idx) => {
    const secondPt = secondPoints[idx] ?? pt;
    return {
      dayKey: pt.dayKey,
      label: pt.label,
      firstTotal: pt.dislikes,
      secondTotal: secondPt.dislikes,
      firstGrowth: pt.dislikes - firstBase,
      secondGrowth: secondPt.dislikes - secondBase,
      firstDaily: pt.dailyDelta,
      secondDaily: secondPt.dailyDelta,
    };
  });
}

export function computeCompareSlopeSummary(points: DislikeHistoryPoint[]): CompareSlopeSummary {
  if (points.length === 0) {
    return {
      netGrowth: 0,
      growthPercent: 0,
      avgDailySlope: 0,
      recent7dSlope: 0,
      previous7dSlope: 0,
      momentumDelta: 0,
      momentumTrend: 'steady',
    };
  }

  const startVal = points[0].dislikes;
  const endVal = points[points.length - 1].dislikes;
  const netGrowth = endVal - startVal;
  const growthPercent = startVal > 0 ? Number(((netGrowth / startVal) * 100).toFixed(1)) : 0;
  const spanDays = Math.max(1, points.length - 1);
  const avgDailySlope = Number((netGrowth / spanDays).toFixed(1));

  const recentSlice = points.slice(-7);
  const prevSlice = points.slice(-14, -7);

  const recent7dSlope =
    recentSlice.length > 0
      ? Number(
          (
            recentSlice.reduce((sum, p) => sum + p.dailyDelta, 0) / recentSlice.length
          ).toFixed(1)
        )
      : 0;
  const previous7dSlope =
    prevSlice.length > 0
      ? Number(
          (prevSlice.reduce((sum, p) => sum + p.dailyDelta, 0) / prevSlice.length).toFixed(
            1
          )
        )
      : 0;

  const momentumDelta = Number((recent7dSlope - previous7dSlope).toFixed(1));
  let momentumTrend: CompareSlopeSummary['momentumTrend'] = 'steady';
  if (momentumDelta >= 0.5) {
    momentumTrend = 'accelerating';
  } else if (momentumDelta <= -0.5) {
    momentumTrend = 'decelerating';
  }

  return {
    netGrowth,
    growthPercent,
    avgDailySlope,
    recent7dSlope,
    previous7dSlope,
    momentumDelta,
    momentumTrend,
  };
}

