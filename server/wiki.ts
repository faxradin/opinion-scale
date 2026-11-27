import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiResearchResult,
  FigureCategory,
  FigureSuggestion,
  GroundedSource,
  PublicFigure,
  SuggestionAiVerification,
  WikiDetails,
} from '../src/types';
import { CATEGORIES, isSafeHttpUrl } from '../src/utils/ranking';

const WIKI_HEADERS = {
  'User-Agent': 'OpinionScaleIndex/1.0 (https://localhost)',
  Accept: 'application/json',
};

const PHOTO_CACHE_DIR = path.resolve(process.cwd(), 'data', 'photos');
const photoMissCache = new Map<string, number>();
const PHOTO_MISS_TTL_MS = 10 * 60 * 1000;

function isAllowedWikimediaHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'upload.wikimedia.org' ||
      host.endsWith('.wikimedia.org') ||
      host.endsWith('.wikipedia.org')
    );
  } catch {
    return false;
  }
}

interface RawWikiSummary extends WikiDetails {
  wikibaseItem?: string;
}

const ALLOWED_WIKI_LANGS = new Set([
  'fa',
  'en',
  'zh',
  'hi',
  'es',
  'fr',
  'ar',
  'bn',
  'pt',
  'ru',
  'ja',
]);

const WIKI_SOURCE_NAMES: Record<string, string> = {
  fa: 'ویکی‌پدیای فارسی',
  en: 'English Wikipedia',
  zh: '中文维基百科',
  hi: 'हिन्दी विकिपीडिया',
  es: 'Wikipedia en español',
  fr: 'Wikipédia en français',
  ar: 'ويكيبيديا العربية',
  bn: 'বাংলা উইকিপিডিয়া',
  pt: 'Wikipédia em português',
  ru: 'Русская Википедия',
  ja: '日本語版ウィキペディア',
};

async function fetchWikiSummary(lang: string, title: string): Promise<RawWikiSummary | null> {
  if (!title.trim() || !ALLOWED_WIKI_LANGS.has(lang)) return null;
  const normalized = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${normalized}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { headers: WIKI_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      description?: string;
      extract?: string;
      wikibase_item?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
      type?: string;
    };
    if (!data.extract || data.type === 'disambiguation') return null;

    const pageUrl = data.content_urls?.desktop?.page;
    const safePageUrl = isSafeHttpUrl(pageUrl)
      ? pageUrl!
      : `https://${lang}.wikipedia.org/wiki/${normalized}`;
    const rawThumb = data.thumbnail?.source || data.originalimage?.source;
    const safeThumb = rawThumb && isAllowedWikimediaHost(rawThumb) ? rawThumb : undefined;

    return {
      title: data.title || title,
      description: data.description || '',
      extract: data.extract,
      url: safePageUrl,
      thumbnailUrl: safeThumb,
      lang,
      sourceName: WIKI_SOURCE_NAMES[lang] ?? `${lang.toUpperCase()} Wikipedia`,
      wikibaseItem: data.wikibase_item,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWikiTitle(lang: string, query: string): Promise<string | null> {
  if (!query.trim() || !ALLOWED_WIKI_LANGS.has(lang)) return null;
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query.trim()
  )}&format=json&srlimit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(endpoint, { headers: WIKI_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return data.query?.search?.[0]?.title || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveInterwikiTitle(
  fromLang: string,
  fromTitle: string,
  targetLang: string
): Promise<string | null> {
  if (!fromTitle.trim() || !ALLOWED_WIKI_LANGS.has(fromLang) || !ALLOWED_WIKI_LANGS.has(targetLang)) {
    return null;
  }
  const endpoint = `https://${fromLang}.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=${encodeURIComponent(
    targetLang
  )}&redirects=1&format=json&titles=${encodeURIComponent(fromTitle.trim().replace(/\s+/g, '_'))}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(endpoint, { headers: WIKI_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          { langlinks?: Array<{ '*': string; lang?: string }> }
        >;
      };
    };
    const pages = Object.values(data.query?.pages ?? {});
    const match = pages[0]?.langlinks?.[0]?.['*'];
    return match || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupWikipediaProfile(params: {
  name: string;
  englishName?: string;
  wikiTitleFa?: string;
  wikiTitleEn?: string;
  preferredLang?: string;
}): Promise<WikiDetails | null> {
  const pref =
    params.preferredLang && ALLOWED_WIKI_LANGS.has(params.preferredLang)
      ? params.preferredLang
      : 'fa';

  const candidatesEn = [params.wikiTitleEn, params.englishName].filter(Boolean) as string[];
  const enState: { hit: RawWikiSummary | null } = { hit: null };
  const fetchEnHit = async (): Promise<RawWikiSummary | null> => {
    if (enState.hit) return enState.hit;
    for (const title of candidatesEn) {
      const hit = await fetchWikiSummary('en', title);
      if (hit) {
        enState.hit = hit;
        return enState.hit;
      }
    }
    if (params.englishName) {
      const searchedEn = await searchWikiTitle('en', params.englishName);
      if (searchedEn) {
        enState.hit = await fetchWikiSummary('en', searchedEn);
      }
    }
    return enState.hit;
  };

  let prefHit: RawWikiSummary | null = null;

  if (pref === 'fa') {
    const candidatesFa = [params.wikiTitleFa, params.name].filter(Boolean) as string[];
    for (const title of candidatesFa) {
      const hit = await fetchWikiSummary('fa', title);
      if (hit) {
        prefHit = hit;
        break;
      }
    }
    if (!prefHit) {
      const searchedFa = await searchWikiTitle('fa', params.name);
      if (searchedFa) {
        prefHit = await fetchWikiSummary('fa', searchedFa);
      }
    }
    if (!prefHit || !prefHit.thumbnailUrl || !prefHit.wikibaseItem) {
      await fetchEnHit();
    }
  } else if (pref === 'en') {
    prefHit = await fetchEnHit();
    if (!prefHit) {
      const candidatesFa = [params.wikiTitleFa, params.name].filter(Boolean) as string[];
      for (const title of candidatesFa) {
        const hit = await fetchWikiSummary('fa', title);
        if (hit) {
          prefHit = hit;
          break;
        }
      }
    }
  } else {
    const enSeedTitle = params.wikiTitleEn || params.englishName;
    if (enSeedTitle) {
      const localizedTitle = await resolveInterwikiTitle('en', enSeedTitle, pref);
      if (localizedTitle) {
        prefHit = await fetchWikiSummary(pref, localizedTitle);
      }
    }
    if (!prefHit && (params.englishName || params.name)) {
      const searchedPref = await searchWikiTitle(pref, params.englishName || params.name);
      if (searchedPref) {
        prefHit = await fetchWikiSummary(pref, searchedPref);
      }
    }
    if (!prefHit || !prefHit.thumbnailUrl || !prefHit.wikibaseItem) {
      await fetchEnHit();
    }
  }

  const primary = prefHit || enState.hit;
  if (!primary) return null;

  const { wikibaseItem: _ignored, ...rest } = primary;
  return {
    ...rest,
    thumbnailUrl: primary.thumbnailUrl || enState.hit?.thumbnailUrl,
  };
}

function isValidRasterImageBuffer(buf: Buffer, contentType: string): boolean {
  if (buf.length < 8 || buf.length > 5 * 1024 * 1024) return false;
  const ct = contentType.toLowerCase();
  if (ct.includes('svg')) return false;
  // JPEG FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WEBP RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function sanitizePromptField(val: unknown, maxLen: number = 160): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\r\n\t\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>`]/g, '')
    .trim()
    .slice(0, maxLen);
}

export async function getCachedFigurePhoto(
  figure: Pick<PublicFigure, 'id' | 'name' | 'englishName' | 'wikiTitleFa' | 'wikiTitleEn'>
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(figure.id)) {
    return null;
  }

  const lastMiss = photoMissCache.get(figure.id);
  if (lastMiss && Date.now() - lastMiss < PHOTO_MISS_TTL_MS) {
    return null;
  }

  if (!fs.existsSync(PHOTO_CACHE_DIR)) {
    fs.mkdirSync(PHOTO_CACHE_DIR, { recursive: true, mode: 0o700 });
  }

  const metaPath = path.resolve(PHOTO_CACHE_DIR, `${figure.id}.json`);
  const imgPath = path.resolve(PHOTO_CACHE_DIR, `${figure.id}.bin`);
  if (
    !metaPath.startsWith(PHOTO_CACHE_DIR + path.sep) ||
    !imgPath.startsWith(PHOTO_CACHE_DIR + path.sep)
  ) {
    return null;
  }

  if (fs.existsSync(imgPath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { contentType?: string };
      const buffer = fs.readFileSync(imgPath);
      const ct = meta.contentType || 'image/jpeg';
      if (isValidRasterImageBuffer(buffer, ct)) {
        return { buffer, contentType: ct };
      }
    } catch {
      // Refetch below if cache read failed
    }
  }

  const wiki = await lookupWikipediaProfile({
    name: figure.name,
    englishName: figure.englishName,
    wikiTitleFa: figure.wikiTitleFa,
    wikiTitleEn: figure.wikiTitleEn,
  });

  if (!wiki?.thumbnailUrl || !isAllowedWikimediaHost(wiki.thumbnailUrl)) {
    photoMissCache.set(figure.id, Date.now());
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(wiki.thumbnailUrl, {
      headers: {
        'User-Agent': 'OpinionScaleIndex/1.0 (https://localhost)',
        Accept: 'image/jpeg,image/png,image/webp,image/gif',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      photoMissCache.set(figure.id, Date.now());
      return null;
    }
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!contentType.startsWith('image/') || contentType.includes('svg')) {
      photoMissCache.set(figure.id, Date.now());
      return null;
    }

    const contentLen = Number(res.headers.get('content-length') || '0');
    if (contentLen > 5 * 1024 * 1024) {
      photoMissCache.set(figure.id, Date.now());
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (!isValidRasterImageBuffer(buffer, contentType)) {
      photoMissCache.set(figure.id, Date.now());
      return null;
    }

    fs.writeFileSync(imgPath, buffer, { mode: 0o600 });
    fs.writeFileSync(metaPath, JSON.stringify({ contentType }), { mode: 0o600 });
    return { buffer, contentType };
  } catch {
    photoMissCache.set(figure.id, Date.now());
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function researchFigureWithGemini(params: {
  name: string;
  englishName: string;
  category: string;
}): Promise<AiResearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('کلید دسترسی هوش مصنوعی در تنظیمات سرور تعریف نشده است.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const safeName = sanitizePromptField(params.name, 120);
  const safeEnglish = sanitizePromptField(params.englishName, 120);
  const safeCategory = sanitizePromptField(params.category, 60);

  const prompt = `درباره شخصیت عمومی زیر یک گزارش کوتاه، مستند و کاملاً بی‌طرفانه به زبان فارسی بنویس:
نام: ${safeName} (${safeEnglish})
حوزه: ${safeCategory}

در این گزارش:
1. خلاصه‌ای دقیق از سوابق و نقش عمومی این فرد ارائه بده.
2. دیدگاه‌های متنوع در افکار عمومی (هم دلایل انتقادات و مخالفت‌ها و هم دیدگاه حامیان یا دستاوردها) را به‌صورت متوازن و بدون قضاوت ارزشی یا برچسب‌زنی بیان کن.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'تو یک پژوهشگر دانشنامه‌ای بی‌طرف هستی. همیشه لحن خنثی، مستند و غیرجانبدارانه داشته باش. دیدگاه‌های مختلف درباره محبوبیت یا انتقاد از چهره‌های عمومی را به‌صورت متعادل و مستند گزارش بده و پاسخ را به صورت JSON معتبر برگردان.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'خلاصه مستند و بی‌طرفانه از سوابق و جایگاه عمومی شخص به زبان فارسی',
          },
          perspectives: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '۳ تا ۴ نکته کلیدی درباره دیدگاه‌های مختلف موافق و منتقد در افکار عمومی',
          },
        },
        required: ['summary', 'perspectives'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  let parsed: { summary?: string; perspectives?: string[] } = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {
      summary: rawText || 'اطلاعات تکمیلی در دسترس نیست.',
      perspectives: [],
    };
  }

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: GroundedSource[] = [];
  const seenUris = new Set<string>();

  for (const chunk of chunks) {
    const web = (chunk as { web?: { uri?: string; title?: string } }).web;
    if (web?.uri && isSafeHttpUrl(web.uri) && !seenUris.has(web.uri)) {
      seenUris.add(web.uri);
      sources.push({
        title: web.title || 'منبع معتبر وب',
        uri: web.uri,
      });
    }
  }

  return {
    summary: parsed.summary || 'خلاصه‌ای دریافت نشد.',
    perspectives: Array.isArray(parsed.perspectives) ? parsed.perspectives : [],
    sources: sources.slice(0, 6),
  };
}

export async function verifySuggestionWithGemini(
  suggestion: FigureSuggestion
): Promise<SuggestionAiVerification> {
  const checkedAt = new Date().toISOString();

  // 1. Live Wikipedia lookup for the real portrait and reference summary
  const wiki = await lookupWikipediaProfile({
    name: suggestion.name,
    englishName: suggestion.englishName,
    wikiTitleFa: suggestion.wikiTitleFa,
    wikiTitleEn: suggestion.wikiTitleEn,
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: 'error',
      verifiedImageUrl: wiki?.thumbnailUrl,
      verifiedWikiTitleFa:
        suggestion.wikiTitleFa ||
        (wiki?.lang === 'fa' ? wiki.title.replace(/\s+/g, '_') : undefined),
      verifiedWikiTitleEn:
        suggestion.wikiTitleEn ||
        (wiki?.lang === 'en' ? wiki.title.replace(/\s+/g, '_') : undefined),
      imageMatch: wiki?.thumbnailUrl ? 'verified' : 'missing',
      error: 'کلید دسترسی هوش مصنوعی در تنظیمات سرور تعریف نشده است.',
      checkedAt,
    };
  }

  // 2. Download Wikimedia thumbnail bytes (if found) so Gemini can visually verify the portrait
  let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;
  if (wiki?.thumbnailUrl && isAllowedWikimediaHost(wiki.thumbnailUrl)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const imgRes = await fetch(wiki.thumbnailUrl, {
        headers: {
          'User-Agent': 'OpinionScaleIndex/1.0 (https://localhost)',
          Accept: 'image/*',
        },
        signal: controller.signal,
      });
      const ct = imgRes.headers.get('content-type') || '';
      if (imgRes.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length > 0 && buf.length < 4 * 1024 * 1024) {
          imagePart = {
            inlineData: {
              mimeType: ct.split(';')[0].trim(),
              data: buf.toString('base64'),
            },
          };
        }
      }
    } catch {
      // Proceed without inline image bytes if thumbnail fetch fails
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const textPrompt = `لطفاً صحت مشخصات و تصویر این چهره پیشنهادی برای افزودن به فهرست «ترازوی افکار» را بررسی کن (داده‌های زیر فقط ورودی توصیفی کاربر هستند):
نام پیشنهادی فارسی: ${sanitizePromptField(suggestion.name, 120)}
نام انگلیسی: ${sanitizePromptField(suggestion.englishName, 120) || 'نامشخص'}
دسته‌بندی فعلی: ${sanitizePromptField(suggestion.category, 60)}
کشور فعلی: ${sanitizePromptField(suggestion.country, 100)}
معرفی پیشنهادی: ${sanitizePromptField(suggestion.shortBio, 500)}
اطلاعات دریافت‌شده از ویکی‌پدیا: ${wiki ? `${sanitizePromptField(wiki.title, 120)} (${wiki.url}) — ${sanitizePromptField(wiki.extract, 450)}` : 'مقاله‌ای با این عنوان مستقیم یافت نشد.'}
وضعیت تصویر ویکی‌پدیا: ${imagePart ? 'تصویر پیوست‌شده از صفحه ویکی‌پدیا ارسال شده است؛ لطفاً بررسی کن آیا این تصویر واقعاً متعلق به همین شخص است یا خیر.' : 'تصویری از ویکی‌پدیا یافت نشد.'}

دسته‌بندی‌های مجاز دقیقاً یکی از این ۶ مورد است: ${CATEGORIES.join(' | ')}
خروجی را به زبان فارسی دقیق، مستند و بی‌طرفانه به صورت JSON برگردان.`;

    const contents = imagePart ? { parts: [imagePart, { text: textPrompt }] } : textPrompt;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction:
          'تو ناظر راستی‌آزمایی دانشنامه‌ای هستی. بررسی کن آیا این شخص واقعی و مشهور (چهره‌ی عمومی) است، مشخصات دقیق او (نام فارسی، نام انگلیسی، دسته‌بندی، کشور، عنوان دقیق ویکی‌پدیای انگلیسی و فارسی و بیوگرافی کوتاه بی‌طرفانه) را پیشنهاد بده و در صورت ارسال تصویر بررسی کن تصویر واقعاً چهره همین شخص باشد.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isRealPublicFigure: { type: Type.BOOLEAN },
            verifiedName: { type: Type.STRING },
            verifiedEnglishName: { type: Type.STRING },
            correctedCategory: { type: Type.STRING },
            correctedCountry: { type: Type.STRING },
            correctedBio: { type: Type.STRING },
            verifiedWikiTitleFa: { type: Type.STRING },
            verifiedWikiTitleEn: { type: Type.STRING },
            imageMatchesPerson: { type: Type.BOOLEAN },
            imageNote: { type: Type.STRING },
            confidence: { type: Type.STRING },
            verificationNotes: { type: Type.STRING },
          },
          required: [
            'isRealPublicFigure',
            'verifiedName',
            'verifiedEnglishName',
            'correctedCategory',
            'correctedCountry',
            'correctedBio',
            'confidence',
            'verificationNotes',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      isRealPublicFigure?: boolean;
      verifiedName?: string;
      verifiedEnglishName?: string;
      correctedCategory?: string;
      correctedCountry?: string;
      correctedBio?: string;
      verifiedWikiTitleFa?: string;
      verifiedWikiTitleEn?: string;
      imageMatchesPerson?: boolean;
      imageNote?: string;
      confidence?: string;
      verificationNotes?: string;
    };

    const validCategory: FigureCategory = CATEGORIES.includes(
      parsed.correctedCategory as FigureCategory
    )
      ? (parsed.correctedCategory as FigureCategory)
      : suggestion.category;

    // If AI suggested a cleaner English/Persian Wiki title and we still missed a portrait, retry Wikipedia once
    let verifiedImageUrl = wiki?.thumbnailUrl;
    if (!verifiedImageUrl && (parsed.verifiedWikiTitleEn || parsed.verifiedWikiTitleFa)) {
      const retryWiki = await lookupWikipediaProfile({
        name: parsed.verifiedName || suggestion.name,
        englishName: parsed.verifiedEnglishName || suggestion.englishName,
        wikiTitleFa: parsed.verifiedWikiTitleFa,
        wikiTitleEn: parsed.verifiedWikiTitleEn,
      });
      if (retryWiki?.thumbnailUrl) {
        verifiedImageUrl = retryWiki.thumbnailUrl;
      }
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: GroundedSource[] = [];
    const seenUris = new Set<string>();
    for (const chunk of chunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri && isSafeHttpUrl(web.uri) && !seenUris.has(web.uri)) {
        seenUris.add(web.uri);
        sources.push({ title: web.title || 'منبع معتبر وب', uri: web.uri });
      }
    }

    const imageMatch: 'verified' | 'missing' | 'mismatch' = !verifiedImageUrl
      ? 'missing'
      : imagePart && parsed.imageMatchesPerson === false
      ? 'mismatch'
      : 'verified';

    return {
      status: 'verified',
      isRealPublicFigure: parsed.isRealPublicFigure ?? true,
      verifiedName: parsed.verifiedName || suggestion.name,
      verifiedEnglishName: parsed.verifiedEnglishName || suggestion.englishName,
      correctedCategory: validCategory,
      correctedCountry: parsed.correctedCountry || suggestion.country,
      correctedBio: parsed.correctedBio || suggestion.shortBio,
      verifiedWikiTitleFa:
        parsed.verifiedWikiTitleFa ||
        suggestion.wikiTitleFa ||
        (wiki?.lang === 'fa' ? wiki.title.replace(/\s+/g, '_') : ''),
      verifiedWikiTitleEn:
        parsed.verifiedWikiTitleEn ||
        suggestion.wikiTitleEn ||
        (wiki?.lang === 'en' ? wiki.title.replace(/\s+/g, '_') : ''),
      verifiedImageUrl,
      imageMatch,
      imageNote:
        parsed.imageNote ||
        (imageMatch === 'verified'
          ? 'تصویر دریافت‌شده از ویکی‌پدیا با شخص مطابقت دارد.'
          : imageMatch === 'mismatch'
          ? 'تصویر یافت‌شده با مشخصات شخص مطابقت قطعی نداشت؛ بررسی دستی ادمین لازم است.'
          : 'تصویری در ویکی‌پدیا یافت نشد؛ می‌توانید پیش از انتشار تصویر را ثبت کنید.'),
      confidence:
        parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
          ? parsed.confidence
          : 'medium',
      verificationNotes: parsed.verificationNotes || 'بررسی مشخصات با موفقیت انجام شد.',
      sources: sources.slice(0, 5),
      checkedAt,
    };
  } catch (err) {
    return {
      status: 'error',
      verifiedImageUrl: wiki?.thumbnailUrl,
      imageMatch: wiki?.thumbnailUrl ? 'verified' : 'missing',
      error: err instanceof Error ? err.message : 'خطا در بررسی هوش مصنوعی.',
      checkedAt,
    };
  }
}
