import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DislikeEvent, FigureInput, FigureSuggestion, PublicFigure } from '../src/types';
import { buildSeedDislikeEvents, buildSeedSuggestions, SEED_FIGURES } from './seed';

export interface StoredVoteMeta {
  totalSelections: number;
  lockedUntil: number;
  lastSelectedAt: number;
}

export interface StoreData {
  seedVersion?: number;
  figures: PublicFigure[];
  suggestions: FigureSuggestion[];
  votesByClient: Record<string, string[]>;
  voteMetaByClient?: Record<string, StoredVoteMeta>;
  suggestionVotesByClient: Record<string, string[]>;
  bookmarksByClient: Record<string, string[]>;
  dislikeEvents: DislikeEvent[];
}

const CURRENT_SEED_VERSION = 4;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function writeStoreAtomic(data: StoreData): void {
  ensureDataDir();
  const tmpPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, STORE_PATH);
}

function normalizeSuggestion(raw: Partial<FigureSuggestion>): FigureSuggestion {
  const votes = Number.isFinite(raw.votes) ? Math.max(0, Math.floor(raw.votes!)) : 0;
  const status = raw.status === 'pending_admin' || votes >= 1000 ? 'pending_admin' : 'collecting';
  return {
    id: raw.id || `sug-${crypto.randomUUID().slice(0, 8)}`,
    name: raw.name || '',
    englishName: raw.englishName || raw.name || '',
    category: raw.category || 'سیاسی',
    country: raw.country || '',
    shortBio: raw.shortBio || '',
    wikiTitleFa: raw.wikiTitleFa || '',
    wikiTitleEn: raw.wikiTitleEn || '',
    votes,
    status,
    thresholdReachedAt: raw.thresholdReachedAt,
    aiVerification: raw.aiVerification,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

export function readStore(): StoreData {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = {
      seedVersion: CURRENT_SEED_VERSION,
      figures: SEED_FIGURES.map((f) => ({ ...f })),
      suggestions: buildSeedSuggestions(),
      votesByClient: {},
      voteMetaByClient: {},
      suggestionVotesByClient: {},
      bookmarksByClient: {},
      dislikeEvents: buildSeedDislikeEvents(),
    };
    writeStoreAtomic(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const existingList: PublicFigure[] = (Array.isArray(parsed.figures) ? parsed.figures : SEED_FIGURES).map((rawFig) => {
      // Drop legacy life-status fields that older versions of this app persisted.
      const { isDeceased: _d, deathDate: _dd, statusCheckedAt: _sc, ...fig } = rawFig as PublicFigure & {
        isDeceased?: boolean;
        deathDate?: string;
        statusCheckedAt?: string;
      };
      return {
      ...fig,
      imageUrl:
        !fig.imageUrl || fig.imageUrl.startsWith('/src/assets/images/portrait_')
          ? `/api/figures/${fig.id}/photo`
          : fig.imageUrl,
      };
    });

    let figures: PublicFigure[] = existingList;
    let suggestions: FigureSuggestion[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map(normalizeSuggestion)
      : [];
    let dislikeEvents: DislikeEvent[] = Array.isArray(parsed.dislikeEvents)
      ? parsed.dislikeEvents.filter(
          (ev): ev is DislikeEvent =>
            Boolean(ev) &&
            typeof ev.figureId === 'string' &&
            Number.isFinite(ev.ts) &&
            Number.isFinite(ev.delta)
        )
      : buildSeedDislikeEvents();
    let needsUpgradeWrite = false;

    if ((parsed.seedVersion ?? 1) < CURRENT_SEED_VERSION) {
      const seedById = new Map(SEED_FIGURES.map((f) => [f.id, f]));
      figures = existingList.map((fig) => {
        const seedMatch = seedById.get(fig.id);
        if (seedMatch && seedMatch.dislikes > fig.dislikes) {
          return { ...fig, dislikes: seedMatch.dislikes };
        }
        return fig;
      });
      const existingIds = new Set(figures.map((f) => f.id));
      const additions: PublicFigure[] = SEED_FIGURES.filter((seedFig) => !existingIds.has(seedFig.id));
      if (additions.length > 0) {
        figures = [...figures, ...additions];
      }
      if (suggestions.length === 0) {
        suggestions = buildSeedSuggestions();
      }
      const existingEventKeys = new Set(dislikeEvents.map((e) => e.figureId));
      const extraEvents = buildSeedDislikeEvents().filter((e) => !existingEventKeys.has(e.figureId));
      if (extraEvents.length > 0) {
        dislikeEvents = [...dislikeEvents, ...extraEvents];
      }
      needsUpgradeWrite = true;
    }

    const rawVotes =
      parsed.votesByClient && typeof parsed.votesByClient === 'object' ? parsed.votesByClient : {};
    const normalizedVotes: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(rawVotes)) {
      if (Array.isArray(v)) {
        normalizedVotes[k] = v.filter((id): id is string => typeof id === 'string').slice(0, 1);
      }
    }

    const rawVoteMeta =
      parsed.voteMetaByClient && typeof parsed.voteMetaByClient === 'object'
        ? parsed.voteMetaByClient
        : {};
    const normalizedVoteMeta: Record<string, StoredVoteMeta> = {};
    for (const [k, meta] of Object.entries(rawVoteMeta)) {
      if (meta && typeof meta === 'object') {
        normalizedVoteMeta[k] = {
          totalSelections: Number.isFinite(meta.totalSelections) ? Math.max(0, Math.floor(meta.totalSelections)) : 0,
          lockedUntil: Number.isFinite(meta.lockedUntil) ? Math.max(0, meta.lockedUntil) : 0,
          lastSelectedAt: Number.isFinite(meta.lastSelectedAt) ? Math.max(0, meta.lastSelectedAt) : 0,
        };
      }
    }

    const rawSugVotes =
      parsed.suggestionVotesByClient && typeof parsed.suggestionVotesByClient === 'object'
        ? parsed.suggestionVotesByClient
        : {};
    const normalizedSugVotes: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(rawSugVotes)) {
      if (Array.isArray(v)) {
        normalizedSugVotes[k] = v.filter((id): id is string => typeof id === 'string');
      }
    }

    const store: StoreData = {
      seedVersion: CURRENT_SEED_VERSION,
      figures,
      suggestions,
      votesByClient: normalizedVotes,
      voteMetaByClient: normalizedVoteMeta,
      suggestionVotesByClient: normalizedSugVotes,
      bookmarksByClient:
        parsed.bookmarksByClient && typeof parsed.bookmarksByClient === 'object'
          ? parsed.bookmarksByClient
          : {},
      dislikeEvents,
    };

    if (needsUpgradeWrite) {
      writeStoreAtomic(store);
    }

    return store;
  } catch {
    const fallback: StoreData = {
      seedVersion: CURRENT_SEED_VERSION,
      figures: SEED_FIGURES.map((f) => ({ ...f })),
      suggestions: buildSeedSuggestions(),
      votesByClient: {},
      voteMetaByClient: {},
      suggestionVotesByClient: {},
      bookmarksByClient: {},
      dislikeEvents: buildSeedDislikeEvents(),
    };
    writeStoreAtomic(fallback);
    return fallback;
  }
}

export function saveStore(data: StoreData): void {
  const cutoff35d = Date.now() - 35 * 24 * 60 * 60 * 1000;
  const prunedEvents = (data.dislikeEvents ?? []).filter((ev) => ev.ts >= cutoff35d);
  writeStoreAtomic({
    ...data,
    seedVersion: CURRENT_SEED_VERSION,
    dislikeEvents: prunedEvents,
  });
}

export function createFigureRecord(input: FigureInput): PublicFigure {
  const id = `fig-${crypto.randomUUID().slice(0, 8)}`;
  const cleanName = input.name.trim();
  const cleanEnglish = (input.englishName ?? '').trim();
  const providedImg = (input.imageUrl ?? '').trim();
  return {
    id,
    name: cleanName,
    englishName: cleanEnglish || cleanName,
    category: input.category,
    country: input.country.trim(),
    shortBio: input.shortBio.trim(),
    imageUrl: providedImg || `/api/figures/${id}/photo`,
    wikiTitleFa: (input.wikiTitleFa ?? '').trim() || cleanName.replace(/\s+/g, '_'),
    wikiTitleEn: (input.wikiTitleEn ?? '').trim() || (cleanEnglish ? cleanEnglish.replace(/\s+/g, '_') : ''),
    dislikes: Math.max(0, Math.floor(input.dislikes ?? 0)),
    createdAt: new Date().toISOString(),
  };
}
