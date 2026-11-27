import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { TrendDirection } from '../types';

interface TrendIndicatorProps {
  trend: TrendDirection;
  change24h: number;
  compact?: boolean;
}

export function TrendIndicator({
  trend,
  change24h,
  compact = false,
}: TrendIndicatorProps) {
  const { t, formatNumber } = useLanguage();
  const absFormatted = formatNumber(Math.abs(change24h));

  if (trend === 'up') {
    const label = t.trendUp(absFormatted);
    return (
      <span
        data-testid="trend-up"
        title={label}
        aria-label={label}
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums text-red-400 shrink-0 whitespace-nowrap"
      >
        <ArrowUp className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span dir="ltr">+{absFormatted}</span>
      </span>
    );
  }

  if (trend === 'down') {
    const label = t.trendDown(absFormatted);
    return (
      <span
        data-testid="trend-down"
        title={label}
        aria-label={label}
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums text-emerald-400 shrink-0 whitespace-nowrap"
      >
        <ArrowDown className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span dir="ltr">-{absFormatted}</span>
      </span>
    );
  }

  return (
    <span
      data-testid="trend-flat"
      title={t.trendFlat}
      aria-label={t.trendFlat}
      className={`inline-flex items-center text-[11px] text-zinc-600 shrink-0 ${
        compact ? 'px-1' : ''
      }`}
    >
      <Minus className="w-3 h-3" aria-hidden="true" />
    </span>
  );
}
