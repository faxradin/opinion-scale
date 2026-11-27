export type FigureCategory =
  | 'سیاسی'
  | 'نظامی و جنگ‌افروز'
  | 'رهبران مذهبی'
  | 'فناوری و رسانه'
  | 'سلبریتی'
  | 'ورزشکار';

export interface PublicFigure {
  id: string;
  name: string;
  englishName: string;
  category: FigureCategory;
  country: string;
  shortBio: string;
  imageUrl: string;
  wikiTitleFa: string;
  wikiTitleEn: string;
  dislikes: number;
  createdAt: string;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface DislikeEvent {
  figureId: string;
  ts: number;
  delta: number;
}

export type HistoryRange = '7d' | '30d';

export interface DislikeHistoryPoint {
  dayKey: string;
  label: string;
  dislikes: number;
  dailyDelta: number;
}

export interface RankedFigure extends PublicFigure {
  rank: number;
  sharePercent: number;
  change24h: number;
  trend24h: TrendDirection;
}

export interface CategoryStat {
  category: FigureCategory;
  count: number;
  totalDislikes: number;
  sharePercent: number;
}

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface SuggestionAiVerification {
  status: 'pending' | 'verified' | 'error';
  isRealPublicFigure?: boolean;
  verifiedName?: string;
  verifiedEnglishName?: string;
  correctedCategory?: FigureCategory;
  correctedCountry?: string;
  correctedBio?: string;
  verifiedWikiTitleFa?: string;
  verifiedWikiTitleEn?: string;
  verifiedImageUrl?: string;
  imageMatch?: 'verified' | 'missing' | 'mismatch';
  imageNote?: string;
  confidence?: 'high' | 'medium' | 'low';
  verificationNotes?: string;
  sources?: GroundedSource[];
  error?: string;
  checkedAt?: string;
}

export interface FigureSuggestion {
  id: string;
  name: string;
  englishName: string;
  category: FigureCategory;
  country: string;
  shortBio: string;
  wikiTitleFa: string;
  wikiTitleEn: string;
  votes: number;
  status: 'collecting' | 'pending_admin';
  thresholdReachedAt?: string;
  aiVerification?: SuggestionAiVerification;
  createdAt: string;
}

export interface WikiDetails {
  title: string;
  description: string;
  extract: string;
  url: string;
  thumbnailUrl?: string;
  lang: string;
  sourceName: string;
}

export interface AiResearchResult {
  summary: string;
  perspectives: string[];
  sources: GroundedSource[];
}

export interface FigureInput {
  name: string;
  englishName?: string;
  category: FigureCategory;
  country: string;
  shortBio: string;
  imageUrl?: string;
  wikiTitleFa?: string;
  wikiTitleEn?: string;
  dislikes?: number;
}

export interface VotePolicyState {
  totalSelections: number;
  changesUsed: number;
  remainingChanges: number;
  maxChanges: number;
  lockedUntil: number;
  lastSelectedAt: number;
}
