import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createFigureRecord, readStore, saveStore } from './server/store';
import {
  checkAdminLoginRateLimit,
  claimAdminPasscode,
  clearAdminLoginFailures,
  getAdminAuthStatus,
  issueAdminToken,
  issueSignedVoterToken,
  recordAdminLoginFailure,
  requireAdmin,
  revokeAdminToken,
  updateAdminCredentials,
  verifyAdminCredentials,
  verifySignedVoterToken,
} from './server/auth';
import {
  getCachedFigurePhoto,
  lookupWikipediaProfile,
  researchFigureWithGemini,
  verifySuggestionWithGemini,
} from './server/wiki';
import {
  applySingleVoteWithPolicy,
  applySuggestionVote,
  buildVotePolicyState,
  sortFiguresByDislikes,
  SUGGESTION_VOTE_THRESHOLD,
  validateFigureInput,
} from './src/utils/ranking';
import type { FigureCategory, FigureInput, FigureSuggestion } from './src/types';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const VOTER_COOKIE_NAME = 'dw_voter';

function getClientIp(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function setVoterCookie(req: express.Request, res: express.Response, voterId: string): void {
  const signed = issueSignedVoterToken(voterId);
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = req.secure || proto === 'https' || IS_PROD;
  const parts = [
    `${VOTER_COOKIE_NAME}=${encodeURIComponent(signed)}`,
    'Path=/',
    `Max-Age=${365 * 24 * 60 * 60}`,
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure', 'Partitioned');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function resolveVoterId(req: express.Request, res: express.Response): string {
  const cookies = parseCookies(req.headers.cookie);
  const cookieVid = verifySignedVoterToken(cookies[VOTER_COOKIE_NAME]);
  if (cookieVid) {
    return cookieVid;
  }

  const headerId = req.headers['x-client-id'];
  const voterId =
    typeof headerId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(headerId)
      ? headerId
      : `v-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  setVoterCookie(req, res, voterId);
  return voterId;
}

function createIpRateLimiter(windowMs: number, maxHits: number, message: string) {
  const hits = new Map<string, number[]>();
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (hits.get(ip) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= maxHits) {
      res.status(429).json({ error: message });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) {
      for (const [k, arr] of hits.entries()) {
        if (arr.every((ts) => ts <= cutoff)) hits.delete(k);
      }
    }
    next();
  };
}

function isValidEntityId(id: string | undefined): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function requireValidIdParam(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!isValidEntityId(req.params.id)) {
    res.status(400).json({ error: 'شناسه درخواستی نامعتبر است.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security Response Headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://upload.wikimedia.org https://*.wikimedia.org",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self' https://aistudio.google.com https://*.google.com",
      ].join('; ')
    );
    next();
  });

  // Origin / CSRF guard on mutating API routes
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }

    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site') {
      res.status(403).json({ error: 'درخواست بین‌دامنه‌ای مجاز نیست.' });
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.trim().length > 0) {
      try {
        const originHost = new URL(origin).host.toLowerCase();
        const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
          .split(',')[0]
          .trim()
          .toLowerCase();
        if (requestHost && originHost !== requestHost) {
          res.status(403).json({ error: 'مبدأ درخواست (Origin) معتبر نیست.' });
          return;
        }
      } catch {
        res.status(403).json({ error: 'مبدأ درخواست نامعتبر است.' });
        return;
      }
    }

    next();
  });

  // Strict tight body limit globally; allow 2MB only on admin figure image uploads
  const largeAdminJson = express.json({ limit: '2mb' });
  const defaultJson = express.json({ limit: '64kb' });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/admin/figures')) {
      largeAdminJson(req, res, next);
      return;
    }
    defaultJson(req, res, next);
  });

  const voteLimiter = createIpRateLimiter(
    15 * 60 * 1000,
    30,
    'تعداد درخواست‌های رأی‌گیری شما موقتاً بیش از حد مجاز بوده است. لطفاً دقایقی دیگر تلاش کنید.'
  );
  const suggestionLimiter = createIpRateLimiter(
    15 * 60 * 1000,
    25,
    'تعداد درخواست‌های بخش پیشنهادات موقتاً محدود شده است. لطفاً کمی بعد دوباره تلاش کنید.'
  );
  const aiLimiter = createIpRateLimiter(
    10 * 60 * 1000,
    12,
    'تعداد درخواست‌های گزارش منابع موقتاً به سقف مجاز رسیده است. لطفاً کمی بعد امتحان کنید.'
  );

  // Public directory read endpoint
  app.get('/api/figures', (req, res) => {
    const clientId = resolveVoterId(req, res);
    const store = readStore();
    const ranked = sortFiguresByDislikes(store.figures, store.dislikeEvents);
    const votedIds = (store.votesByClient[clientId] ?? []).slice(0, 1);
    const bookmarkedIds = store.bookmarksByClient[clientId] ?? [];
    const votePolicy = buildVotePolicyState(store.voteMetaByClient?.[clientId]);
    res.json({
      figures: ranked,
      votedIds,
      votePolicy,
      bookmarkedIds,
      dislikeEvents: store.dislikeEvents,
    });
  });

  // Real documentary portrait proxy cached from Wikipedia / Wikimedia Commons
  app.get('/api/figures/:id/photo', requireValidIdParam, async (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const figure = store.figures.find((f) => f.id === id);
    if (!figure) {
      res.status(404).end();
      return;
    }

    const photo = await getCachedFigurePhoto(figure);
    if (!photo) {
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80"><rect width="80" height="80" fill="#09090b"/><circle cx="40" cy="30" r="11" fill="none" stroke="#52525b" stroke-width="2.5"/><path d="M20 62c2.5-10 10.5-15 20-15s17.5 5 20 15" fill="none" stroke="#52525b" stroke-width="2.5" stroke-linecap="round"/></svg>`;
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.send(fallbackSvg);
      return;
    }

    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(photo.buffer);
  });

  // Single-choice selection per visitor (48h cooldown + max 5 lifetime changes)
  app.post('/api/figures/:id/dislike', requireValidIdParam, voteLimiter, (req, res) => {
    const clientId = resolveVoterId(req, res);
    const { id } = req.params;
    const store = readStore();
    const currentVotes = (store.votesByClient[clientId] ?? []).slice(0, 1);
    const currentMeta = store.voteMetaByClient?.[clientId];
    const nowMs = Date.now();

    const outcome = applySingleVoteWithPolicy(
      store.figures,
      currentVotes,
      id,
      currentMeta,
      nowMs,
      true
    );

    if (!outcome.ok) {
      const status = outcome.reason === 'not_found' ? 404 : 409;
      res.status(status).json({
        error: outcome.error,
        reason: outcome.reason,
        votedIds: outcome.nextVotedIds,
        votePolicy: outcome.nextPolicy ?? buildVotePolicyState(currentMeta),
      });
      return;
    }

    store.votesByClient[clientId] = outcome.nextVotedIds;
    if (!store.voteMetaByClient) {
      store.voteMetaByClient = {};
    }
    if (outcome.nextPolicy) {
      store.voteMetaByClient[clientId] = {
        totalSelections: outcome.nextPolicy.totalSelections,
        lockedUntil: outcome.nextPolicy.lockedUntil,
        lastSelectedAt: outcome.nextPolicy.lastSelectedAt,
      };
    }

    for (const ev of outcome.deltaApplied ?? []) {
      store.dislikeEvents.push({
        figureId: ev.figureId,
        ts: nowMs,
        delta: ev.delta,
      });
    }
    saveStore(store);

    res.json({
      action: outcome.action,
      figures: sortFiguresByDislikes(store.figures, store.dislikeEvents),
      votedIds: outcome.nextVotedIds,
      votePolicy: outcome.nextPolicy ?? buildVotePolicyState(store.voteMetaByClient[clientId]),
      dislikeEvents: store.dislikeEvents,
    });
  });

  // Toggle bookmark/mark for a figure
  app.post('/api/figures/:id/bookmark', requireValidIdParam, (req, res) => {
    const clientId = resolveVoterId(req, res);
    const { id } = req.params;
    const store = readStore();
    const target = store.figures.find((f) => f.id === id);
    if (!target) {
      res.status(404).json({ error: 'چهره مورد نظر یافت نشد.' });
      return;
    }

    const currentBookmarks = new Set(store.bookmarksByClient[clientId] ?? []);
    let bookmarked = true;
    if (currentBookmarks.has(id)) {
      currentBookmarks.delete(id);
      bookmarked = false;
    } else {
      currentBookmarks.add(id);
      bookmarked = true;
    }

    store.bookmarksByClient[clientId] = Array.from(currentBookmarks);
    saveStore(store);

    res.json({
      bookmarked,
      bookmarkedIds: store.bookmarksByClient[clientId],
    });
  });

  // Community suggestions board & 1,000-vote threshold queue
  const runSuggestionAiVerification = async (suggestionId: string) => {
    const current = readStore();
    const target = current.suggestions.find((s) => s.id === suggestionId);
    if (!target) return;
    const verification = await verifySuggestionWithGemini(target);
    const refreshed = readStore();
    const updatedTarget = refreshed.suggestions.find((s) => s.id === suggestionId);
    if (updatedTarget) {
      updatedTarget.aiVerification = verification;
      saveStore(refreshed);
    }
  };

  const sortSuggestions = (items: FigureSuggestion[]) =>
    [...items].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'pending_admin' ? -1 : 1;
      }
      if (b.votes !== a.votes) {
        return b.votes - a.votes;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  app.get('/api/suggestions', (req, res) => {
    const clientId = resolveVoterId(req, res);
    const store = readStore();
    res.json({
      suggestions: sortSuggestions(store.suggestions),
      votedSuggestionIds: store.suggestionVotesByClient[clientId] ?? [],
      threshold: SUGGESTION_VOTE_THRESHOLD,
    });
  });

  app.post('/api/suggestions', suggestionLimiter, (req, res) => {
    const clientId = resolveVoterId(req, res);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Partial<FigureInput>;
    const validation = validateFigureInput({
      ...body,
      imageUrl: '',
    });
    if (!validation.valid) {
      res.status(400).json({ error: 'اطلاعات پیشنهادی کامل یا معتبر نیست.', errors: validation.errors });
      return;
    }

    const store = readStore();
    const suggestion: FigureSuggestion = {
      id: `sug-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name!.trim(),
      englishName: (typeof body.englishName === 'string' ? body.englishName : '').trim() || body.name!.trim(),
      category: body.category as FigureCategory,
      country: body.country!.trim(),
      shortBio: body.shortBio!.trim(),
      wikiTitleFa:
        (typeof body.wikiTitleFa === 'string' ? body.wikiTitleFa : '').trim().slice(0, 200) ||
        body.name!.trim().replace(/\s+/g, '_'),
      wikiTitleEn: (typeof body.wikiTitleEn === 'string' ? body.wikiTitleEn : '').trim().slice(0, 200),
      votes: 1,
      status: 'collecting',
      createdAt: new Date().toISOString(),
    };

    store.suggestions.unshift(suggestion);
    const voted = new Set(store.suggestionVotesByClient[clientId] ?? []);
    voted.add(suggestion.id);
    store.suggestionVotesByClient[clientId] = Array.from(voted);
    saveStore(store);

    res.status(201).json({
      ok: true,
      suggestion,
      suggestions: sortSuggestions(store.suggestions),
      votedSuggestionIds: store.suggestionVotesByClient[clientId],
    });
  });

  app.post('/api/suggestions/:id/vote', requireValidIdParam, suggestionLimiter, (req, res) => {
    const clientId = resolveVoterId(req, res);
    const { id } = req.params;
    const store = readStore();
    const currentVotes = store.suggestionVotesByClient[clientId] ?? [];
    const outcome = applySuggestionVote(store.suggestions, currentVotes, id);

    if (!outcome.ok) {
      const status = outcome.error?.includes('یافت نشد') ? 404 : 409;
      res.status(status).json({
        error: outcome.error,
        votedSuggestionIds: outcome.nextVotedIds,
      });
      return;
    }

    store.suggestionVotesByClient[clientId] = outcome.nextVotedIds;
    const updatedSuggestion = store.suggestions.find((s) => s.id === id);
    if (outcome.reachedThresholdNow && updatedSuggestion) {
      updatedSuggestion.aiVerification = { status: 'pending' };
    }
    saveStore(store);

    if (outcome.reachedThresholdNow) {
      void runSuggestionAiVerification(id).catch(() => {});
    }

    res.json({
      action: outcome.action,
      reachedThresholdNow: outcome.reachedThresholdNow,
      suggestion: updatedSuggestion,
      suggestions: sortSuggestions(store.suggestions),
      votedSuggestionIds: outcome.nextVotedIds,
    });
  });

  // Live Wikipedia lookup
  app.get('/api/wiki', async (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name.slice(0, 120) : '';
    const englishName = typeof req.query.englishName === 'string' ? req.query.englishName.slice(0, 120) : '';
    const wikiTitleFa = typeof req.query.wikiTitleFa === 'string' ? req.query.wikiTitleFa.slice(0, 200) : '';
    const wikiTitleEn = typeof req.query.wikiTitleEn === 'string' ? req.query.wikiTitleEn.slice(0, 200) : '';
    const preferredLang = typeof req.query.lang === 'string' ? req.query.lang : 'fa';

    if (!name && !englishName && !wikiTitleFa && !wikiTitleEn) {
      res.status(400).json({ error: 'نام یا عنوان دانشنامه الزامی است.' });
      return;
    }

    const details = await lookupWikipediaProfile({
      name,
      englishName,
      wikiTitleFa,
      wikiTitleEn,
      preferredLang,
    });

    if (!details) {
      res.status(404).json({ error: 'مقاله مرتبطی در ویکی‌پدیا یافت نشد.' });
      return;
    }

    res.json(details);
  });

  // Grounded AI neutral research endpoint
  app.post('/api/ai/research', aiLimiter, async (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      name?: unknown;
      englishName?: unknown;
      category?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const englishName = typeof body.englishName === 'string' ? body.englishName.trim().slice(0, 120) : '';
    const category = typeof body.category === 'string' ? body.category.trim().slice(0, 60) : '';

    if (!name || !category) {
      res.status(400).json({ error: 'نام و دسته‌بندی چهره الزامی است.' });
      return;
    }

    try {
      const result = await researchFigureWithGemini({
        name,
        englishName: englishName || name,
        category,
      });
      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'خطا در دریافت تحلیل منابع معتبر.';
      res.status(502).json({ error: message });
    }
  });

  // Secret Admin Auth Endpoints (no personal email or hardcoded credentials exposed)
  app.get('/api/admin/status', (_req, res) => {
    res.json(getAdminAuthStatus());
  });

  app.post('/api/admin/claim', (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      username?: unknown;
      passcode?: unknown;
    };
    const username = typeof body.username === 'string' ? body.username : 'admin';
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';

    const result = claimAdminPasscode(passcode, username);
    if (!result.ok) {
      res.status(403).json({ error: result.error });
      return;
    }
    const token = issueAdminToken();
    res.status(201).json({ token });
  });

  app.post('/api/admin/login', (req, res) => {
    const ip = getClientIp(req);
    const limit = checkAdminLoginRateLimit(ip);
    if (!limit.allowed) {
      res.status(429).json({
        error: `تعداد تلاش‌های ناموفق بیش از حد مجاز بوده است. لطفاً ${Math.ceil(
          (limit.retryAfterSec ?? 60) / 60
        )} دقیقه دیگر دوباره تلاش کنید.`,
      });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      username?: unknown;
      passcode?: unknown;
    };
    const username = typeof body.username === 'string' ? body.username : 'admin';
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';

    if (!verifyAdminCredentials(passcode, username)) {
      recordAdminLoginFailure(ip);
      res.status(401).json({ error: 'نام کاربری یا گذرواژه مدیریت نادرست است.' });
      return;
    }

    clearAdminLoginFailures(ip);
    const token = issueAdminToken();
    res.json({ token });
  });

  app.post('/api/admin/logout', requireAdmin, (req, res) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    revokeAdminToken(token);
    res.json({ ok: true });
  });

  app.post('/api/admin/change-credentials', requireAdmin, (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      currentPasscode?: unknown;
      currentUsername?: unknown;
      newUsername?: unknown;
      newPasscode?: unknown;
    };
    const currentUser = typeof body.currentUsername === 'string' ? body.currentUsername : '';
    const currentPass = typeof body.currentPasscode === 'string' ? body.currentPasscode : '';
    if (!verifyAdminCredentials(currentPass, currentUser)) {
      res.status(401).json({ error: 'نام کاربری یا گذرواژه فعلی نادرست است.' });
      return;
    }

    const nextUser = typeof body.newUsername === 'string' ? body.newUsername : currentUser;
    const nextPass = typeof body.newPasscode === 'string' ? body.newPasscode : '';
    const result = updateAdminCredentials(nextPass, nextUser);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const token = issueAdminToken();
    res.json({ ok: true, token });
  });

  // Protected Admin Routes
  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const store = readStore();
    res.json({
      figures: sortFiguresByDislikes(store.figures, store.dislikeEvents),
      suggestions: store.suggestions,
    });
  });

  app.post('/api/admin/figures', requireAdmin, (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Partial<FigureInput>;
    const validation = validateFigureInput(body);
    if (!validation.valid) {
      res.status(400).json({ error: 'اطلاعات چهره معتبر نیست.', errors: validation.errors });
      return;
    }

    const store = readStore();
    const record = createFigureRecord(body as FigureInput);
    store.figures.push(record);
    if (record.dislikes > 0) {
      store.dislikeEvents.push({ figureId: record.id, ts: Date.now(), delta: record.dislikes });
    }
    saveStore(store);

    res.status(201).json({
      figure: record,
      figures: sortFiguresByDislikes(store.figures, store.dislikeEvents),
    });
  });

  app.patch('/api/admin/figures/:id', requireValidIdParam, requireAdmin, (req, res) => {
    const { id } = req.params;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Partial<FigureInput>;
    const store = readStore();
    const existing = store.figures.find((f) => f.id === id);
    if (!existing) {
      res.status(404).json({ error: 'چهره مورد نظر یافت نشد.' });
      return;
    }

    const merged: FigureInput = {
      name: typeof body.name === 'string' ? body.name : existing.name,
      englishName: typeof body.englishName === 'string' ? body.englishName : existing.englishName,
      category: body.category ?? existing.category,
      country: typeof body.country === 'string' ? body.country : existing.country,
      shortBio: typeof body.shortBio === 'string' ? body.shortBio : existing.shortBio,
      imageUrl: body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl,
      wikiTitleFa: typeof body.wikiTitleFa === 'string' ? body.wikiTitleFa : existing.wikiTitleFa,
      wikiTitleEn: typeof body.wikiTitleEn === 'string' ? body.wikiTitleEn : existing.wikiTitleEn,
      dislikes: body.dislikes !== undefined ? Number(body.dislikes) : existing.dislikes,
    };

    const validation = validateFigureInput(merged);
    if (!validation.valid) {
      res.status(400).json({ error: 'مقادیر ویرایش‌شده معتبر نیستند.', errors: validation.errors });
      return;
    }

    const prevDislikes = existing.dislikes;
    existing.name = merged.name.trim();
    existing.englishName = (merged.englishName ?? '').trim() || existing.name;
    existing.category = merged.category;
    existing.country = merged.country.trim();
    existing.shortBio = merged.shortBio.trim();
    existing.imageUrl = (merged.imageUrl ?? '').trim() || `/api/figures/${existing.id}/photo`;
    existing.wikiTitleFa = (merged.wikiTitleFa ?? '').trim() || existing.name.replace(/\s+/g, '_');
    existing.wikiTitleEn = (merged.wikiTitleEn ?? '').trim();
    existing.dislikes = Math.max(0, Math.floor(merged.dislikes ?? 0));

    if (existing.dislikes !== prevDislikes) {
      store.dislikeEvents.push({
        figureId: existing.id,
        ts: Date.now(),
        delta: existing.dislikes - prevDislikes,
      });
    }

    saveStore(store);
    res.json({
      figure: existing,
      figures: sortFiguresByDislikes(store.figures, store.dislikeEvents),
    });
  });

  app.delete('/api/admin/figures/:id', requireValidIdParam, requireAdmin, (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const before = store.figures.length;
    store.figures = store.figures.filter((f) => f.id !== id);
    if (store.figures.length === before) {
      res.status(404).json({ error: 'چهره مورد نظر یافت نشد.' });
      return;
    }
    saveStore(store);
    res.json({ figures: sortFiguresByDislikes(store.figures, store.dislikeEvents) });
  });

  app.post('/api/admin/suggestions/:id/verify', requireValidIdParam, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const target = store.suggestions.find((s) => s.id === id);
    if (!target) {
      res.status(404).json({ error: 'پیشنهاد مورد نظر یافت نشد.' });
      return;
    }

    const verification = await verifySuggestionWithGemini(target);
    const refreshed = readStore();
    const updated = refreshed.suggestions.find((s) => s.id === id);
    if (!updated) {
      res.status(404).json({ error: 'پیشنهاد مورد نظر یافت نشد.' });
      return;
    }

    updated.aiVerification = verification;
    saveStore(refreshed);
    res.json({
      suggestion: updated,
      suggestions: sortSuggestions(refreshed.suggestions),
    });
  });

  app.post('/api/admin/suggestions/:id/approve', requireValidIdParam, requireAdmin, (req, res) => {
    const { id } = req.params;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      useAiCorrections?: boolean;
      imageUrl?: string;
    };
    const store = readStore();
    const index = store.suggestions.findIndex((s) => s.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'پیشنهاد مورد نظر یافت نشد.' });
      return;
    }

    const sug = store.suggestions[index];
    const ai = sug.aiVerification;
    const applyAi = body.useAiCorrections !== false && ai?.status === 'verified';

    const newFigure = createFigureRecord({
      name: (applyAi && ai?.verifiedName) || sug.name,
      englishName: (applyAi && ai?.verifiedEnglishName) || sug.englishName,
      category: (applyAi && ai?.correctedCategory) || sug.category,
      country: (applyAi && ai?.correctedCountry) || sug.country,
      shortBio: (applyAi && ai?.correctedBio) || sug.shortBio,
      wikiTitleFa: (applyAi && ai?.verifiedWikiTitleFa) || sug.wikiTitleFa,
      wikiTitleEn: (applyAi && ai?.verifiedWikiTitleEn) || sug.wikiTitleEn,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : applyAi ? ai?.verifiedImageUrl : undefined,
      dislikes: Math.max(1, sug.votes),
    });

    store.figures.push(newFigure);
    store.dislikeEvents.push({ figureId: newFigure.id, ts: Date.now(), delta: newFigure.dislikes });
    store.suggestions.splice(index, 1);
    saveStore(store);

    res.json({
      figures: sortFiguresByDislikes(store.figures, store.dislikeEvents),
      suggestions: sortSuggestions(store.suggestions),
    });
  });

  app.delete('/api/admin/suggestions/:id', requireValidIdParam, requireAdmin, (req, res) => {
    const { id } = req.params;
    const store = readStore();
    store.suggestions = store.suggestions.filter((s) => s.id !== id);
    saveStore(store);
    res.json({ suggestions: store.suggestions });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  // Safe global error handler (never expose internal stack traces)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (res.headersSent) return;
      if (
        err &&
        typeof err === 'object' &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.parse.failed'
      ) {
        res.status(400).json({ error: 'فرمت درخواست نامعتبر است.' });
        return;
      }
      res.status(500).json({ error: 'خطای داخلی سرور رخ داد.' });
    }
  );

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
