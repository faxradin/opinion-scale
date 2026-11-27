import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { DislikeEvent, RankedFigure } from '../types';
import {
  buildCompareMonthlySeries,
  buildFigureDislikeHistory,
  computeCompareSlopeSummary,
  type CompareMetricMode,
  type CompareMonthlyPoint,
} from '../utils/history';
import { getDisplayName } from '../utils/i18n';

interface CompareTrendLineChartProps {
  first: RankedFigure;
  second: RankedFigure;
  dislikeEvents: DislikeEvent[];
}

interface CompareTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: CompareMonthlyPoint;
  }>;
  firstName: string;
  secondName: string;
  mode: CompareMetricMode;
}

const FIRST_COLOR = '#EF4444';
const SECOND_COLOR = '#F59E0B';

function formatMetricValue(pt: CompareMonthlyPoint, slot: 'first' | 'second', mode: CompareMetricMode): number {
  if (mode === 'cumulative') {
    return slot === 'first' ? pt.firstTotal : pt.secondTotal;
  }
  if (mode === 'slope_growth') {
    return slot === 'first' ? pt.firstGrowth : pt.secondGrowth;
  }
  return slot === 'first' ? pt.firstDaily : pt.secondDaily;
}

function CompareTrendTooltip({
  active,
  payload,
  firstName,
  secondName,
  mode,
}: CompareTooltipProps) {
  const { dir, t, formatNumber } = useLanguage();
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }
  const pt = payload[0].payload;
  const firstVal = formatMetricValue(pt, 'first', mode);
  const secondVal = formatMetricValue(pt, 'second', mode);

  const metricLabel =
    mode === 'cumulative'
      ? t.tooltipCumulative
      : mode === 'slope_growth'
      ? t.tooltipGrowth
      : t.tooltipDaily;

  return (
    <div
      dir={dir}
      className="bg-[#0B0B0E]/95 border border-zinc-700 rounded-md px-3 py-2.5 text-xs shadow-xl space-y-1.5 min-w-[190px]"
    >
      <div className="font-semibold text-[#EAE6DF] border-b border-zinc-800 pb-1">
        {pt.label} · {metricLabel}
      </div>
      <div className="flex items-center justify-between gap-3 tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-zinc-200">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: FIRST_COLOR }}
          />
          <span className="truncate max-w-[120px]">{firstName}</span>
        </span>
        <span className="font-bold text-red-400">
          {mode !== 'cumulative' && firstVal > 0 ? '+' : ''}
          {formatNumber(firstVal)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-zinc-200">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: SECOND_COLOR }}
          />
          <span className="truncate max-w-[120px]">{secondName}</span>
        </span>
        <span className="font-bold text-amber-400">
          {mode !== 'cumulative' && secondVal > 0 ? '+' : ''}
          {formatNumber(secondVal)}
        </span>
      </div>
    </div>
  );
}

export function CompareTrendLineChart({
  first,
  second,
  dislikeEvents,
}: CompareTrendLineChartProps) {
  const { lang, option, t, formatNumber } = useLanguage();
  const [mode, setMode] = useState<CompareMetricMode>('cumulative');

  const firstName = getDisplayName(first, lang);
  const secondName = getDisplayName(second, lang);

  const series = useMemo(
    () => buildCompareMonthlySeries(first, second, dislikeEvents, Date.now(), option.locale),
    [first, second, dislikeEvents, option.locale]
  );

  const firstSlope = useMemo(() => {
    const pts = buildFigureDislikeHistory(first, dislikeEvents, '30d', Date.now(), option.locale);
    return computeCompareSlopeSummary(pts);
  }, [first, dislikeEvents, option.locale]);

  const secondSlope = useMemo(() => {
    const pts = buildFigureDislikeHistory(second, dislikeEvents, '30d', Date.now(), option.locale);
    return computeCompareSlopeSummary(pts);
  }, [second, dislikeEvents, option.locale]);

  const firstDataKey =
    mode === 'cumulative'
      ? 'firstTotal'
      : mode === 'slope_growth'
      ? 'firstGrowth'
      : 'firstDaily';

  const secondDataKey =
    mode === 'cumulative'
      ? 'secondTotal'
      : mode === 'slope_growth'
      ? 'secondGrowth'
      : 'secondDaily';

  const steeperLeader =
    firstSlope.avgDailySlope === secondSlope.avgDailySlope
      ? null
      : firstSlope.avgDailySlope > secondSlope.avgDailySlope
      ? {
          winner: firstName,
          diff: Number((firstSlope.avgDailySlope - secondSlope.avgDailySlope).toFixed(1)),
          colorClass: 'text-red-400',
        }
      : {
          winner: secondName,
          diff: Number((secondSlope.avgDailySlope - firstSlope.avgDailySlope).toFixed(1)),
          colorClass: 'text-amber-400',
        };

  return (
    <section
      data-testid="compare-trend-line-chart"
      data-mode={mode}
      className="bg-[#0B0B0F] border border-zinc-800 rounded-lg p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-semibold text-[#EAE6DF] inline-flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-400 shrink-0" />
            <span>{t.compareChartTitle}</span>
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {t.compareChartSubtitle(firstName, secondName)}
          </p>
        </div>

        <div
          role="group"
          aria-label={t.compareModeAria}
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#141418] border border-zinc-800 rounded-md self-start"
        >
          {(
            [
              ['cumulative', t.modeCumulative],
              ['slope_growth', t.modeSlopeGrowth],
              ['daily_delta', t.modeDailyDelta],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              aria-pressed={mode === val}
              className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                mode === val
                  ? 'bg-[#B91C1C] text-white'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Dual Slope Analysis Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs tabular-nums">
        {[
          {
            fig: first,
            name: firstName,
            slope: firstSlope,
            color: FIRST_COLOR,
            accentText: 'text-red-400',
          },
          {
            fig: second,
            name: secondName,
            slope: secondSlope,
            color: SECOND_COLOR,
            accentText: 'text-amber-400',
          },
        ].map(({ fig, name, slope, color, accentText }) => (
          <div
            key={fig.id}
            className="bg-[#111116] border border-zinc-800/90 rounded-md p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-semibold text-[#EAE6DF] truncate">
                  {name}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                  slope.momentumTrend === 'accelerating'
                    ? 'bg-red-950/50 border-red-800/70 text-red-300'
                    : slope.momentumTrend === 'decelerating'
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                }`}
              >
                {slope.momentumTrend === 'accelerating' ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : slope.momentumTrend === 'decelerating' ? (
                  <ArrowDownRight className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                <span>
                  {slope.momentumTrend === 'accelerating'
                    ? t.slopeAccelerating
                    : slope.momentumTrend === 'decelerating'
                    ? t.slopeDecelerating
                    : t.slopeSteady}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800/80">
              <div>
                <div className="text-zinc-500">{t.growth30d}</div>
                <div className={`font-bold mt-0.5 ${accentText}`}>
                  +{formatNumber(slope.netGrowth)}
                  <span className="text-[11px] text-zinc-400 font-normal ms-1">
                    ({formatNumber(slope.growthPercent)}%)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-zinc-500">{t.avgDailySlope}</div>
                <div className="font-semibold text-zinc-200 mt-0.5">
                  +{formatNumber(slope.avgDailySlope)} {t.perDay}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">{t.recent7dVelocity}</div>
                <div className="font-semibold text-zinc-200 mt-0.5">
                  {formatNumber(slope.recent7dSlope)} {t.perDay}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Multi-Line Recharts Visualization */}
      <div dir="ltr" className="w-full h-[250px] pt-1">
        <ResponsiveContainer width="100%" height={250} minWidth={240}>
          <LineChart data={series} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#a1a1aa', fontSize: 10 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fill: '#a1a1aa', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={52}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip
              content={
                <CompareTrendTooltip
                  firstName={firstName}
                  secondName={secondName}
                  mode={mode}
                />
              }
            />
            <Legend
              verticalAlign="top"
              height={28}
              formatter={(value: string) => (
                <span className="text-xs text-zinc-300 font-medium">{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey={firstDataKey}
              name={firstName}
              stroke={FIRST_COLOR}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: FIRST_COLOR, stroke: '#060608', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey={secondDataKey}
              name={secondName}
              stroke={SECOND_COLOR}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: SECOND_COLOR, stroke: '#060608', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Concise Slope Verdict */}
      <div className="text-xs text-zinc-400 bg-[#111116] border border-zinc-800/80 rounded-md px-3.5 py-2.5">
        {steeperLeader ? (
          <span>
            {t.slopeVerdictLead}{' '}
            <strong className={steeperLeader.colorClass}>{steeperLeader.winner}</strong>{' '}
            {t.slopeVerdictMid(formatNumber(steeperLeader.diff))}
          </span>
        ) : (
          <span>{t.slopeVerdictEqual}</span>
        )}
      </div>
    </section>
  );
}
