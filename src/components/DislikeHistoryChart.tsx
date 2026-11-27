import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { DislikeEvent, HistoryRange, RankedFigure } from '../types';
import { buildFigureDislikeHistory, summarizeHistoryWindow } from '../utils/history';
import { getDisplayName } from '../utils/i18n';

interface DislikeHistoryChartProps {
  figure: RankedFigure;
  dislikeEvents: DislikeEvent[];
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label: string;
      dislikes: number;
      dailyDelta: number;
    };
  }>;
}

function CustomHistoryTooltip({ active, payload }: ChartTooltipProps) {
  const { dir, t, formatNumber } = useLanguage();
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }
  const pt = payload[0].payload;
  return (
    <div
      dir={dir}
      className="bg-[#0B0B0E]/95 border border-zinc-700 rounded-md px-3 py-2 text-xs shadow-xl space-y-1"
    >
      <div className="font-semibold text-[#EAE6DF]">{pt.label}</div>
      <div className="text-zinc-300 tabular-nums">
        {t.totalVotesTooltip}:{' '}
        <span className="font-bold text-red-400">{formatNumber(pt.dislikes)}</span>
      </div>
      <div className="text-zinc-400 tabular-nums">
        {t.dailyChangeTooltip}:{' '}
        <span className={pt.dailyDelta > 0 ? 'text-red-400' : 'text-zinc-300'}>
          {pt.dailyDelta > 0 ? '+' : ''}
          {formatNumber(pt.dailyDelta)}
        </span>
      </div>
    </div>
  );
}

export function DislikeHistoryChart({ figure, dislikeEvents }: DislikeHistoryChartProps) {
  const { lang, option, t, formatNumber } = useLanguage();
  const [range, setRange] = useState<HistoryRange>('7d');

  const displayName = getDisplayName(figure, lang);

  const points = useMemo(
    () => buildFigureDislikeHistory(figure, dislikeEvents, range, Date.now(), option.locale),
    [figure, dislikeEvents, range, option.locale]
  );

  const summary = useMemo(() => summarizeHistoryWindow(points), [points]);
  const strokeColor = '#dc2626';
  const gradientId = `dn-history-grad-${figure.id}-${range}`;

  return (
    <section
      data-testid="dislike-history-chart"
      data-range={range}
      className="bg-[#111116] border border-zinc-800 rounded-lg p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#EAE6DF] inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-400" />
            <span>{t.historyTitle}</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {t.historySubtitle(displayName, range)}
          </p>
        </div>

        <div
          role="group"
          aria-label={t.historyRangeAria}
          className="inline-flex items-center gap-1 p-1 bg-[#0B0B0E] border border-zinc-800 rounded-md"
        >
          <button
            type="button"
            onClick={() => setRange('7d')}
            aria-pressed={range === '7d'}
            className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
              range === '7d'
                ? 'bg-[#B91C1C] text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t.weekly7d}
          </button>
          <button
            type="button"
            onClick={() => setRange('30d')}
            aria-pressed={range === '30d'}
            className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
              range === '30d'
                ? 'bg-[#B91C1C] text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {t.monthly30d}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
        <div className="bg-[#0B0B0E] border border-zinc-800/80 rounded-md px-3 py-2">
          <div className="text-zinc-500">{t.periodGrowth}</div>
          <div className="font-bold text-red-400 mt-0.5">
            {summary.netChange >= 0 ? '+' : ''}
            {formatNumber(summary.netChange)}
          </div>
        </div>
        <div className="bg-[#0B0B0E] border border-zinc-800/80 rounded-md px-3 py-2">
          <div className="text-zinc-500">{t.voteRange}</div>
          <div className="font-semibold text-zinc-200 mt-0.5">
            {formatNumber(summary.minDislikes)} {t.rangeSeparator} {formatNumber(summary.maxDislikes)}
          </div>
        </div>
        <div className="bg-[#0B0B0E] border border-zinc-800/80 rounded-md px-3 py-2">
          <div className="text-zinc-500">{t.dailyPeak}</div>
          <div className="font-semibold text-zinc-200 mt-0.5">
            +{formatNumber(summary.peakDailyDelta)}
          </div>
        </div>
      </div>

      <div dir="ltr" className="w-full h-[200px] pt-1">
        <ResponsiveContainer width="100%" height={200} minWidth={220}>
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.42} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#a1a1aa', fontSize: 10 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
              interval={range === '30d' ? 4 : 0}
            />
            <YAxis
              tick={{ fill: '#a1a1aa', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={48}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip content={<CustomHistoryTooltip />} />
            <Area
              type="monotone"
              dataKey="dislikes"
              stroke={strokeColor}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
