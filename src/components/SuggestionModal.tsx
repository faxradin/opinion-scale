import { useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { CATEGORIES, validateFigureInput } from '../utils/ranking';
import type { FigureCategory, FigureSuggestion } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { translateCategory } from '../utils/i18n';

interface SuggestionModalProps {
  open: boolean;
  visitorId: string;
  onClose: () => void;
  onSubmitted?: (suggestions: FigureSuggestion[], votedSuggestionIds: string[]) => void;
}

export function SuggestionModal({
  open,
  visitorId,
  onClose,
  onSubmitted,
}: SuggestionModalProps) {
  const { lang, t } = useLanguage();
  const [name, setName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [category, setCategory] = useState<FigureCategory>('سیاسی');
  const [country, setCountry] = useState('');
  const [shortBio, setShortBio] = useState('');
  const [wikiTitleFa, setWikiTitleFa] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const check = validateFigureInput({
      name,
      englishName,
      category,
      country,
      shortBio,
      wikiTitleFa,
    });
    if (!check.valid) {
      if (lang === 'fa') {
        setErrors(check.errors);
      } else {
        const localizedErrors: Record<string, string> = {};
        if (check.errors.name) localizedErrors.name = t.sugModalErrorDefault;
        if (check.errors.country) localizedErrors.country = t.sugModalErrorDefault;
        if (check.errors.shortBio) localizedErrors.shortBio = t.sugModalErrorDefault;
        if (check.errors.category) localizedErrors.category = t.sugModalErrorDefault;
        setErrors(localizedErrors);
      }
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': visitorId,
        },
        body: JSON.stringify({
          name,
          englishName,
          category,
          country,
          shortBio,
          wikiTitleFa,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error((lang === 'fa' ? data.error : undefined) || t.sugModalErrorDefault);
      }
      const data = (await res.json()) as {
        suggestions?: FigureSuggestion[];
        votedSuggestionIds?: string[];
      };
      if (data.suggestions && onSubmitted) {
        onSubmitted(data.suggestions, data.votedSuggestionIds ?? []);
      }
      setSubmitted(true);
      setName('');
      setEnglishName('');
      setCountry('');
      setShortBio('');
      setWikiTitleFa('');
    } catch (err) {
      setServerError(
        lang === 'fa' && err instanceof Error ? err.message : t.sugModalErrorDefault
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestion-title"
    >
      <div className="bg-[#0B0B0E] border border-zinc-800 w-full sm:max-w-lg rounded-t-xl sm:rounded-xl overflow-hidden max-h-[90vh] flex flex-col text-[#EAE6DF] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 bg-[#111116] border-b border-zinc-800">
          <h2 id="suggestion-title" className="font-editorial text-lg font-bold text-[#EAE6DF]">
            {t.sugModalTitle}
          </h2>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              onClose();
            }}
            aria-label={t.sugModalCloseAria}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {submitted ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-base font-semibold text-[#EAE6DF]">
                {t.sugModalSuccessTitle}
              </p>
              <p className="text-sm text-zinc-400">
                {t.sugModalSuccessDesc}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  onClose();
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#EAE6DF] text-[#060608] text-sm font-medium cursor-pointer"
              >
                {t.backToDirectory}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="sug-name" className="block text-xs font-medium text-zinc-300">
                  {t.fieldNameLabel}
                </label>
                <input
                  id="sug-name"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.fieldNamePlaceholder}
                  className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#141418] border border-zinc-700 rounded-lg text-sm text-[#EAE6DF] placeholder:text-zinc-500"
                />
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sug-en" className="block text-xs font-medium text-zinc-300">
                    {t.fieldEnLabel}
                  </label>
                  <input
                    id="sug-en"
                    type="text"
                    dir="ltr"
                    value={englishName}
                    onChange={(e) => setEnglishName(e.target.value)}
                    placeholder={t.fieldEnPlaceholder}
                    className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#141418] border border-zinc-700 rounded-lg text-sm text-[#EAE6DF] placeholder:text-zinc-500"
                  />
                </div>

                <div>
                  <label htmlFor="sug-cat" className="block text-xs font-medium text-zinc-300">
                    {t.fieldCategoryLabel}
                  </label>
                  <select
                    id="sug-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FigureCategory)}
                    className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#141418] border border-zinc-700 rounded-lg text-sm text-[#EAE6DF]"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {translateCategory(cat, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sug-country" className="block text-xs font-medium text-zinc-300">
                    {t.fieldCountryLabel}
                  </label>
                  <input
                    id="sug-country"
                    type="text"
                    required
                    minLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder={t.fieldCountryPlaceholder}
                    className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#141418] border border-zinc-700 rounded-lg text-sm text-[#EAE6DF] placeholder:text-zinc-500"
                  />
                  {errors.country && (
                    <p className="mt-1 text-xs text-red-400">{errors.country}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="sug-wiki" className="block text-xs font-medium text-zinc-300">
                    {t.fieldWikiLabel}
                  </label>
                  <input
                    id="sug-wiki"
                    type="text"
                    value={wikiTitleFa}
                    onChange={(e) => setWikiTitleFa(e.target.value)}
                    placeholder={t.fieldWikiPlaceholder}
                    className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#141418] border border-zinc-700 rounded-lg text-sm text-[#EAE6DF] placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="sug-bio" className="block text-xs font-medium text-zinc-300">
                  {t.fieldBioLabel}
                </label>
                <textarea
                  id="sug-bio"
                  rows={3}
                  required
                  minLength={10}
                  value={shortBio}
                  onChange={(e) => setShortBio(e.target.value)}
                  placeholder={t.fieldBioPlaceholder}
                  className="mt-1 w-full px-3 py-2 bg-[#141418] border border-zinc-700 rounded-lg text-sm text-[#EAE6DF] placeholder:text-zinc-500"
                />
                {errors.shortBio && (
                  <p className="mt-1 text-xs text-red-400">{errors.shortBio}</p>
                )}
              </div>

              {serverError && <p className="text-xs text-red-400">{serverError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-[#B91C1C] text-white text-sm font-medium hover:bg-[#991B1B] disabled:opacity-60 inline-flex items-center gap-2 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t.submitSuggestion}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
