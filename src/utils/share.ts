import type { RankedFigure } from '../types';
import {
  formatLocalizedNumber,
  getDisplayName,
  getMessages,
  translateCategory,
  type AppLanguage,
} from './i18n';
import { isSafeHttpUrl } from './ranking';

export function buildShareMessage(
  figure: Pick<RankedFigure, 'name' | 'rank' | 'dislikes' | 'category'> & { englishName?: string },
  lang: AppLanguage = 'fa'
): string {
  const t = getMessages(lang);
  return t.shareMessageTemplate(
    getDisplayName(figure, lang),
    formatLocalizedNumber(figure.rank, lang),
    formatLocalizedNumber(figure.dislikes, lang),
    translateCategory(figure.category, lang)
  );
}

export function buildTelegramShareUrl(text: string, pageUrl: string): string {
  const safePage = isSafeHttpUrl(pageUrl) ? pageUrl : 'https://t.me';
  const params = new URLSearchParams({
    url: safePage,
    text,
  });
  return `https://t.me/share/url?${params.toString()}`;
}

export function buildWhatsAppShareUrl(text: string, pageUrl: string): string {
  const combined = isSafeHttpUrl(pageUrl) ? `${text}\n${pageUrl}` : text;
  const params = new URLSearchParams({
    text: combined,
  });
  return `https://wa.me/?${params.toString()}`;
}
