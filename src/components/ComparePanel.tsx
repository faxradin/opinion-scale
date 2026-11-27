import { useState } from 'react';
import { Scale, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { DislikeEvent, RankedFigure } from '../types';
import { getDisplayName, translateCategory, translateCountry } from '../utils/i18n';
import { CompareTrendLineChart } from './CompareTrendLineChart';
import { DislikeHistoryChart } from './DislikeHistoryChart';
import { PortraitImage } from './PortraitImage';

interface ComparePanelProps {
  figures: RankedFigure[];
  dislikeEvents?: DislikeEvent[];
  selectedIds: string[];
  onSelectPair: (slot: 0 | 1, id: string) => void;
  onClear: () => void;
}

export function ComparePanel({
  figures,
  dislikeEvents = [],
  selectedIds,
  onSelectPair,
  onClear,
}: ComparePanelProps) {
  const { lang, t, formatNumber } = useLanguage();
  const [detailSlot, setDetailSlot] = useState<0 | 1>(0);

  const first = figures.find((f) => f.id === selectedIds[0]) ?? figures[0];
  const second =
    figures.find((f) => f.id === selectedIds[1]) ??
    figures.find((f) => f.id !== first?.id) ??
    figures[1];

  if (!first || !second) {
    return (
      <section className="bg-[#141418]/85 border border-zinc-800 rounded-xl p-6 text-center text-sm text-zinc-400">
        {t.compareNeedTwo}
      </section>
    );
  }

  const maxVotes = Math.max(first.dislikes, second.dislikes, 1);
  const detailFigure = detailSlot === 0 ? first : second;
  const firstName = getDisplayName(first, lang);
  const secondName = getDisplayName(second, lang);

  return (
    <section className="bg-[#0D0D11]/82 border border-zinc-800 rounded-lg p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-red-500" />
          <h2 className="font-editorial text-xl font-bold text-[#EAE6DF]">
            {t.compareTitle}
          </h2>
        </div>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>{t.clearSelections}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          { item: first, slot: 0 as const },
          { item: second, slot: 1 as const },
        ].map(({ item, slot }) => {
          const itemName = getDisplayName(item, lang);
          const itemCat = translateCategory(item.category, lang);
          const itemCountry = translateCountry(item.country, lang);
          const itemBio =
            lang === 'fa' ? item.shortBio : t.localizedBioTemplate(itemCat, itemCountry);
          return (
            <div
              key={slot}
              className="border border-zinc-800 rounded-lg p-4 bg-[#08080B]/88 space-y-4"
            >
              <label className="block text-xs font-medium text-zinc-400">
                {slot === 0 ? t.selectFigureFirst : t.selectFigureSecond}
                <select
                  value={item.id}
                  onChange={(e) => onSelectPair(slot, e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] px-3 py-2 bg-[#141418] border border-zinc-700 rounded-md text-sm text-[#EAE6DF]"
                >
                  {figures.map((fig) => (
                    <option key={fig.id} value={fig.id}>
                      #{formatNumber(fig.rank)} — {getDisplayName(fig, lang)} (
                      {translateCategory(fig.category, lang)})
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-3.5">
                <PortraitImage
                  src={item.imageUrl}
                  alt={itemName}
                  noir={false}
                  className="w-16 h-16 rounded-sm border border-zinc-800 shrink-0"
                />
                <div className="min-w-0">
                  <div
                    className="font-editorial text-lg font-bold truncate text-[#EAE6DF]"
                  >
                    {itemName}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {itemCat} · {itemCountry}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center border-t border-b border-zinc-800 py-3">
                <div>
                  <dt className="text-xs text-zinc-400">{t.rankShort}</dt>
                  <dd className="text-base font-bold text-red-500 tabular-nums mt-0.5">
                    #{formatNumber(item.rank)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-400">{t.dislikesShort}</dt>
                  <dd className="text-base font-bold text-[#EAE6DF] tabular-nums mt-0.5">
                    {formatNumber(item.dislikes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-400">{t.voteShareShort}</dt>
                  <dd className="text-base font-bold text-zinc-300 tabular-nums mt-0.5">
                    {formatNumber(item.sharePercent)}%
                  </dd>
                </div>
              </dl>

              <div className="space-y-1.5">
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#DC2626] rounded-full transition-[width] duration-200"
                    style={{ width: `${Math.round((item.dislikes / maxVotes) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{itemBio}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 30-day Multi-Figure Trend & Slope Line Chart */}
      <CompareTrendLineChart
        first={first}
        second={second}
        dislikeEvents={dislikeEvents}
      />

      {/* Individual Breakdown with Toggle */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-zinc-400 font-medium">
            {t.singleBreakdownLabel}
          </span>
          <div className="inline-flex items-center gap-1 p-1 bg-[#141418] border border-zinc-800 rounded-md">
            <button
              type="button"
              onClick={() => setDetailSlot(0)}
              aria-pressed={detailSlot === 0}
              className={`min-h-[30px] px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                detailSlot === 0 ? 'bg-red-700 text-white' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {firstName}
            </button>
            <button
              type="button"
              onClick={() => setDetailSlot(1)}
              aria-pressed={detailSlot === 1}
              className={`min-h-[30px] px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                detailSlot === 1 ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {secondName}
            </button>
          </div>
        </div>
        <DislikeHistoryChart figure={detailFigure} dislikeEvents={dislikeEvents} />
      </div>
    </section>
  );
}
