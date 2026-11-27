import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { FigureCategory, FigureInput, FigureSuggestion, RankedFigure } from '../types';
import { CATEGORIES, formatPersianNumber, validateFigureInput } from '../utils/ranking';
import { PortraitImage } from './PortraitImage';

interface AdminConsoleProps {
  onExit: () => void;
  onDirectoryChanged: () => void;
}

const EMPTY_FORM: FigureInput = {
  name: '',
  englishName: '',
  category: 'سیاسی',
  country: '',
  shortBio: '',
  imageUrl: '',
  wikiTitleFa: '',
  wikiTitleEn: '',
  dislikes: 0,
};

export function AdminConsole({ onExit, onDirectoryChanged }: AdminConsoleProps) {
  const [authMode, setAuthMode] = useState<'loading' | 'unclaimed' | 'locked' | 'authenticated'>(
    'loading'
  );
  const [authServerMode, setAuthServerMode] = useState<'env' | 'file' | 'unclaimed'>('unclaimed');
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [securityPanelOpen, setSecurityPanelOpen] = useState(false);
  const [currentCredUser, setCurrentCredUser] = useState('');
  const [currentCredPass, setCurrentCredPass] = useState('');
  const [newCredUser, setNewCredUser] = useState('');
  const [newCredPass, setNewCredPass] = useState('');
  const [credStatusMsg, setCredStatusMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<'figures' | 'suggestions' | 'analytics'>('figures');
  const [figures, setFigures] = useState<RankedFigure[]>([]);
  const [suggestions, setSuggestions] = useState<FigureSuggestion[]>([]);
  const [adminSearch, setAdminSearch] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FigureInput>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [wikiFetching, setWikiFetching] = useState(false);
  const [verifyingSuggestionId, setVerifyingSuggestionId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/status')
      .then((res) => res.json())
      .then((data: { configured: boolean; mode: 'env' | 'file' | 'unclaimed' }) => {
        setAuthServerMode(data.mode);
        setAuthMode(data.configured ? 'locked' : 'unclaimed');
      })
      .catch(() => {
        setAuthMode('locked');
      });
  }, []);

  const fetchOverview = async (authToken: string) => {
    const res = await fetch('/api/admin/overview', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.status === 401) {
      setToken(null);
      setAuthMode('locked');
      return;
    }
    const data = (await res.json()) as {
      figures: RankedFigure[];
      suggestions: FigureSuggestion[];
    };
    setFigures(data.figures ?? []);
    setSuggestions(data.suggestions ?? []);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = authMode === 'unclaimed' ? '/api/admin/claim' : '/api/admin/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), passcode }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'ورود ناموفق بود.');
        return;
      }
      setToken(data.token);
      setCurrentCredUser(username.trim());
      setNewCredUser(username.trim());
      setPasscode('');
      setAuthMode('authenticated');
      if (authMode === 'unclaimed') {
        setAuthServerMode('file');
      }
      await fetchOverview(data.token);
    } catch {
      setAuthError('خطا در برقراری ارتباط با سرور.');
    }
  };

  const handleLogout = async () => {
    const activeToken = token;
    setToken(null);
    setAuthMode('locked');
    setSecurityPanelOpen(false);
    if (activeToken) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}` },
      }).catch(() => {});
    }
  };

  const handleChangeCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCredStatusMsg(null);
    try {
      const res = await fetch('/api/admin/change-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentUsername: currentCredUser.trim(),
          currentPasscode: currentCredPass,
          newUsername: newCredUser.trim(),
          newPasscode: newCredPass,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setCredStatusMsg(data.error || 'تغییر مشخصات امنیتی انجام نشد.');
        return;
      }
      setToken(data.token);
      setCurrentCredUser(newCredUser.trim());
      setCurrentCredPass('');
      setNewCredPass('');
      setSecurityPanelOpen(false);
      setStatusMsg('نام کاربری و گذرواژه مدیریت با موفقیت به‌روزرسانی شد.');
    } catch {
      setCredStatusMsg('خطا در ارتباط با سرور.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormErrors((prev) => ({ ...prev, imageUrl: 'فقط فایل تصویری مجاز است.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditForm = (fig: RankedFigure) => {
    setEditingId(fig.id);
    setForm({
      name: fig.name,
      englishName: fig.englishName,
      category: fig.category,
      country: fig.country,
      shortBio: fig.shortBio,
      imageUrl: fig.imageUrl,
      wikiTitleFa: fig.wikiTitleFa,
      wikiTitleEn: fig.wikiTitleEn,
      dislikes: fig.dislikes,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleWikiAutofill = async () => {
    const queryName = form.name.trim();
    const queryEn = (form.englishName ?? '').trim();
    const queryWikiFa = (form.wikiTitleFa ?? '').trim();
    if (!queryName && !queryEn && !queryWikiFa) {
      setStatusMsg('ابتدا نام فارسی یا انگلیسی چهره را وارد کنید.');
      return;
    }

    setWikiFetching(true);
    setStatusMsg(null);
    try {
      const qs = new URLSearchParams({
        name: queryName,
        englishName: queryEn,
        wikiTitleFa: queryWikiFa,
      });
      const res = await fetch(`/api/wiki?${qs.toString()}`);
      if (!res.ok) {
        setStatusMsg('مقاله یا تصویر مرتبطی در ویکی‌پدیا یافت نشد.');
        return;
      }
      const data = (await res.json()) as {
        title?: string;
        extract?: string;
        thumbnailUrl?: string;
        lang?: 'fa' | 'en';
      };

      setForm((prev) => ({
        ...prev,
        imageUrl: data.thumbnailUrl || prev.imageUrl,
        shortBio: prev.shortBio.trim() ? prev.shortBio : (data.extract ?? '').slice(0, 320),
        wikiTitleFa:
          prev.wikiTitleFa?.trim() ||
          (data.lang === 'fa' && data.title ? data.title.replace(/\s+/g, '_') : prev.wikiTitleFa),
        wikiTitleEn:
          prev.wikiTitleEn?.trim() ||
          (data.lang === 'en' && data.title ? data.title.replace(/\s+/g, '_') : prev.wikiTitleEn),
      }));
      setStatusMsg(
        data.thumbnailUrl
          ? 'عکس واقعی و اطلاعات چهره از ویکی‌پدیا دریافت شد.'
          : 'اطلاعات متنی دریافت شد، اما تصویری در ویکی‌پدیا یافت نشد؛ می‌توانید لینک یا فایل عکس را وارد کنید.'
      );
    } catch {
      setStatusMsg('خطا در ارتباط با ویکی‌پدیا.');
    } finally {
      setWikiFetching(false);
    }
  };

  const handleSaveFigure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const check = validateFigureInput(form);
    if (!check.valid) {
      setFormErrors(check.errors);
      return;
    }

    setBusy(true);
    setStatusMsg(null);
    try {
      const url = editingId ? `/api/admin/figures/${editingId}` : '/api/admin/figures';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        figures?: RankedFigure[];
        error?: string;
      };
      if (!res.ok) {
        setStatusMsg(data.error || 'خطا در ذخیره‌سازی.');
        return;
      }
      if (data.figures) {
        setFigures(data.figures);
      }
      setFormOpen(false);
      setStatusMsg(editingId ? 'چهره با موفقیت ویرایش شد.' : 'چهره جدید به فهرست اضافه شد.');
      onDirectoryChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFigure = async (id: string) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/figures/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { figures: RankedFigure[] };
        setFigures(data.figures);
        setStatusMsg('چهره از فهرست حذف شد.');
        onDirectoryChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySuggestion = async (id: string) => {
    if (!token) return;
    setVerifyingSuggestionId(id);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/admin/suggestions/${id}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        suggestion?: FigureSuggestion;
        suggestions?: FigureSuggestion[];
        error?: string;
      };
      if (!res.ok) {
        setStatusMsg(data.error || 'بررسی با هوش مصنوعی انجام نشد.');
        return;
      }
      if (data.suggestions) {
        setSuggestions(data.suggestions);
      }
      setStatusMsg(
        data.suggestion?.aiVerification?.status === 'verified'
          ? 'بررسی مشخصات و تصویر توسط هوش مصنوعی تکمیل شد.'
          : data.suggestion?.aiVerification?.error || 'وضعیت بررسی به‌روزرسانی شد.'
      );
    } finally {
      setVerifyingSuggestionId(null);
    }
  };

  const handleApproveSuggestion = async (id: string, useAiCorrections = true) => {
    if (!token) return;
    const res = await fetch(`/api/admin/suggestions/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ useAiCorrections }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        figures: RankedFigure[];
        suggestions: FigureSuggestion[];
      };
      setFigures(data.figures);
      setSuggestions(data.suggestions);
      setStatusMsg('پیشنهاد تأیید و در فهرست عمومی منتشر شد.');
      onDirectoryChanged();
    }
  };

  const handleRejectSuggestion = async (id: string) => {
    if (!token) return;
    const res = await fetch(`/api/admin/suggestions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { suggestions: FigureSuggestion[] };
      setSuggestions(data.suggestions);
      setStatusMsg('پیشنهاد رد شد.');
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ figures, suggestions }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'opinion-scale-directory.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authMode === 'loading') {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center text-sm text-zinc-400">
        در حال بررسی دسترسی...
      </div>
    );
  }

  if (authMode !== 'authenticated') {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-[#141418] border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-red-400" />
              <h1 className="font-editorial text-xl font-bold text-zinc-100">
                {authMode === 'unclaimed'
                  ? 'تنظیم نخستین نام کاربری و گذرواژه مدیریت'
                  : 'ورود محرمانه به بخش مدیریت'}
              </h1>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              بازگشت
            </button>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">
            {authMode === 'unclaimed'
              ? 'این بخش کاملاً محرمانه است و هیچ رمز پیش‌فرضی در کد قرار نگرفته است. برای قفل کردن پنل مدیریت، یک نام کاربری و گذرواژه قوی (حداقل ۸ کاراکتر) تعیین کنید.'
              : 'برای دسترسی به مدیریت چهره‌ها، ویرایش آرا و بررسی پیشنهادها، نام کاربری و گذرواژه محرمانه مدیریت را وارد کنید.'}
          </p>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-username" className="block text-xs font-medium text-zinc-300">
                نام کاربری مدیریت
              </label>
              <input
                id="admin-username"
                type="text"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                placeholder="admin"
                className="mt-1.5 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="admin-pass" className="block text-xs font-medium text-zinc-300">
                گذرواژه مدیریت
              </label>
              <input
                id="admin-pass"
                type="password"
                autoComplete={authMode === 'unclaimed' ? 'new-password' : 'current-password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
                minLength={authMode === 'unclaimed' ? 8 : 6}
                placeholder={authMode === 'unclaimed' ? 'حداقل ۸ کاراکتر' : 'گذرواژه محرمانه'}
                className="mt-1.5 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>

            {authError && <p className="text-xs text-red-400">{authError}</p>}

            <button
              type="submit"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-zinc-100 text-zinc-950 text-sm font-medium hover:bg-white cursor-pointer"
            >
              {authMode === 'unclaimed' ? 'ثبت نام کاربری و گذرواژه و ورود' : 'ورود به پنل'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalVotes = figures.reduce((acc, f) => acc + f.dislikes, 0);
  const filteredAdminFigures = adminSearch.trim()
    ? figures.filter((f) =>
        `${f.name} ${f.englishName} ${f.country} ${f.category}`
          .toLowerCase()
          .includes(adminSearch.trim().toLowerCase())
      )
    : figures;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="font-editorial text-2xl font-bold text-zinc-100">
            پنل محرمانه مدیریت فهرست
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            هویت مدیر در نمای عمومی وب‌سایت نمایش داده نمی‌شود
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {authServerMode !== 'env' && (
            <button
              type="button"
              onClick={() => {
                setCredStatusMsg(null);
                setSecurityPanelOpen((prev) => !prev);
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-lg border border-zinc-700 bg-[#1A1A20] text-xs sm:text-sm text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>تغییر نام کاربری و رمز</span>
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-zinc-700 bg-[#1A1A20] text-sm text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>نمای عمومی</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] px-3.5 py-2 rounded-lg border border-zinc-700 bg-[#1A1A20] text-sm text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {securityPanelOpen && authServerMode !== 'env' && (
        <form
          onSubmit={handleChangeCredentials}
          className="bg-[#141418] border border-zinc-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="font-editorial text-base font-bold text-zinc-100">
              به‌روزرسانی نام کاربری و گذرواژه مدیریت
            </h2>
            <button
              type="button"
              onClick={() => setSecurityPanelOpen(false)}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
              aria-label="بستن تنظیمات امنیتی"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cred-cur-user" className="block text-xs text-zinc-300">
                نام کاربری فعلی
              </label>
              <input
                id="cred-cur-user"
                type="text"
                dir="ltr"
                required
                value={currentCredUser}
                onChange={(e) => setCurrentCredUser(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="cred-cur-pass" className="block text-xs text-zinc-300">
                گذرواژه فعلی
              </label>
              <input
                id="cred-cur-pass"
                type="password"
                required
                value={currentCredPass}
                onChange={(e) => setCurrentCredPass(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="cred-new-user" className="block text-xs text-zinc-300">
                نام کاربری جدید
              </label>
              <input
                id="cred-new-user"
                type="text"
                dir="ltr"
                required
                minLength={3}
                value={newCredUser}
                onChange={(e) => setNewCredUser(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="cred-new-pass" className="block text-xs text-zinc-300">
                گذرواژه جدید (حداقل ۸ کاراکتر)
              </label>
              <input
                id="cred-new-pass"
                type="password"
                required
                minLength={8}
                value={newCredPass}
                onChange={(e) => setNewCredPass(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>
          </div>
          {credStatusMsg && <p className="text-xs text-red-400">{credStatusMsg}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-xs sm:text-sm font-medium hover:bg-white cursor-pointer"
            >
              ذخیره مشخصات امنیتی جدید
            </button>
          </div>
        </form>
      )}

      {statusMsg && (
        <div className="bg-[#141418] border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
            aria-label="بستن پیام"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-[#141418] border border-zinc-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('figures')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium cursor-pointer ${
              tab === 'figures' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            مدیریت چهره‌ها ({formatPersianNumber(figures.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('suggestions')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium cursor-pointer ${
              tab === 'suggestions'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            صف پیشنهادها ({formatPersianNumber(suggestions.length)})
          </button>
          <button
            type="button"
            onClick={() => setTab('analytics')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium cursor-pointer ${
              tab === 'analytics'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            آمار و خروجی
          </button>
        </div>

        {tab === 'figures' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateForm}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-sm font-medium hover:bg-[#991B1B] inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن چهره جدید</span>
            </button>
          </div>
        )}
      </div>

      {formOpen && tab === 'figures' && (
        <form
          onSubmit={handleSaveFigure}
          className="bg-[#141418] border border-zinc-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="font-editorial text-lg font-bold text-zinc-100">
              {editingId ? 'ویرایش اطلاعات چهره' : 'ثبت چهره جدید در فهرست'}
            </h2>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
              aria-label="بستن فرم"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="adm-name" className="block text-xs font-medium text-zinc-300">
                نام چهره (فارسی)
              </label>
              <input
                id="adm-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
              {formErrors.name && <p className="mt-1 text-xs text-red-400">{formErrors.name}</p>}
            </div>

            <div>
              <label htmlFor="adm-en" className="block text-xs font-medium text-zinc-300">
                نام انگلیسی
              </label>
              <input
                id="adm-en"
                type="text"
                dir="ltr"
                value={form.englishName}
                onChange={(e) => setForm((p) => ({ ...p, englishName: e.target.value }))}
                className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="adm-cat" className="block text-xs font-medium text-zinc-300">
                دسته‌بندی
              </label>
              <select
                id="adm-cat"
                value={form.category}
                onChange={(e) =>
                  setForm((p) => ({ ...p, category: e.target.value as FigureCategory }))
                }
                className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="adm-country" className="block text-xs font-medium text-zinc-300">
                کشور / حوزه
              </label>
              <input
                id="adm-country"
                type="text"
                value={form.country}
                onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
              {formErrors.country && (
                <p className="mt-1 text-xs text-red-400">{formErrors.country}</p>
              )}
            </div>

            <div>
              <label htmlFor="adm-wiki-fa" className="block text-xs font-medium text-zinc-300">
                عنوان ویکی‌پدیا فارسی
              </label>
              <input
                id="adm-wiki-fa"
                type="text"
                value={form.wikiTitleFa}
                onChange={(e) => setForm((p) => ({ ...p, wikiTitleFa: e.target.value }))}
                className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="adm-dislikes" className="block text-xs font-medium text-zinc-300">
                تعداد دیس‌لایک اولیه / فعلی
              </label>
              <input
                id="adm-dislikes"
                type="number"
                min={0}
                value={form.dislikes ?? 0}
                onChange={(e) =>
                  setForm((p) => ({ ...p, dislikes: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="mt-1 w-full min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adm-bio" className="block text-xs font-medium text-zinc-300">
              بیوگرافی کوتاه و بی‌طرفانه
            </label>
            <textarea
              id="adm-bio"
              rows={3}
              value={form.shortBio}
              onChange={(e) => setForm((p) => ({ ...p, shortBio: e.target.value }))}
              className="mt-1 w-full px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
            />
            {formErrors.shortBio && (
              <p className="mt-1 text-xs text-red-400">{formErrors.shortBio}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="adm-img" className="block text-xs font-medium text-zinc-300">
              تصویر واقعی چهره (ویکی‌پدیا، لینک مستقیم یا آپلود فایل)
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                id="adm-img"
                type="text"
                dir="ltr"
                value={form.imageUrl ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                placeholder="خالی بگذارید تا عکس واقعی از ویکی‌پدیا دریافت شود یا لینک https://... وارد کنید"
                className="flex-1 min-w-[200px] min-h-[44px] px-3 py-2 bg-[#1A1A20] border border-zinc-700 rounded-lg text-sm text-zinc-100"
              />
              <button
                type="button"
                onClick={handleWikiAutofill}
                disabled={wikiFetching}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-sky-700/60 bg-sky-950/40 text-sm text-sky-300 hover:bg-sky-950/70 inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {wikiFetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
                <span>دریافت عکس و توضیح از ویکی‌پدیا</span>
              </button>
              <label className="min-h-[44px] px-4 py-2 rounded-lg border border-zinc-700 bg-[#1A1A20] text-sm text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>آپلود عکس</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">
              در صورت خالی ماندن فیلد تصویر، سامانه به‌صورت خودکار عکس واقعی چهره را از ویکی‌پدیا دریافت و نمایش می‌دهد.
            </p>
            {formErrors.imageUrl && (
              <p className="text-xs text-red-400">{formErrors.imageUrl}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-sm font-medium hover:bg-white cursor-pointer"
            >
              {editingId ? 'ذخیره تغییرات' : 'افزودن به فهرست'}
            </button>
          </div>
        </form>
      )}

      {tab === 'figures' && (
        <div className="space-y-3">
          <input
            type="search"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="جستجو در بین ۲۰۰ چهره..."
            className="w-full max-w-sm min-h-[40px] px-3 py-2 bg-[#141418] border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500"
          />
          <div className="bg-[#141418] border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {filteredAdminFigures.map((fig) => (
              <div
                key={fig.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-bold tabular-nums text-red-400 w-9 shrink-0">
                    #{formatPersianNumber(fig.rank)}
                  </span>
                  <PortraitImage
                    src={fig.imageUrl}
                    alt={fig.name}
                    className="w-12 h-12 rounded-lg border border-zinc-800 shrink-0"
                  />
                  <div className="min-w-0">
                    <div
                      className="font-semibold truncate text-zinc-100"
                    >
                      {fig.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {fig.category} · {fig.country} ·{' '}
                      <span className="tabular-nums">
                        {formatPersianNumber(fig.dislikes)} دیس‌لایک
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(fig)}
                    aria-label={`ویرایش ${fig.name}`}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>ویرایش</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFigure(fig.id)}
                    aria-label={`حذف ${fig.name}`}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-red-400 hover:bg-orange-950/50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'suggestions' && (() => {
        const readySuggestions = suggestions.filter((s) => s.status === 'pending_admin');
        const collectingSuggestions = suggestions.filter((s) => s.status !== 'pending_admin');

        const renderSuggestionItem = (sug: FigureSuggestion, isReady: boolean) => {
          const ai = sug.aiVerification;
          const isVerifying = verifyingSuggestionId === sug.id;

          return (
            <div
              key={sug.id}
              data-testid={`admin-suggestion-${sug.id}`}
              className="p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {ai?.verifiedImageUrl && (
                    <PortraitImage
                      src={ai.verifiedImageUrl}
                      alt={ai.verifiedName || sug.name}
                      className="w-16 h-16 rounded-md border border-zinc-700 shrink-0"
                    />
                  )}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-base text-zinc-100">{sug.name}</span>
                      {sug.englishName && (
                        <span dir="ltr" className="text-xs font-mono text-zinc-500">
                          {sug.englishName}
                        </span>
                      )}
                      <span className="text-xs font-semibold tabular-nums text-red-400">
                        ({formatPersianNumber(sug.votes)} / ۱٬۰۰۰ رأی)
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      {sug.category} · {sug.country}
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{sug.shortBio}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={() => handleVerifySuggestion(sug.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-sky-700/60 bg-sky-950/40 text-sky-300 hover:bg-sky-950/70 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isVerifying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>بررسی مشخصات و تصویر با هوش مصنوعی</span>
                  </button>

                  {isReady && (
                    <button
                      type="button"
                      onClick={() => handleApproveSuggestion(sug.id, true)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {ai?.status === 'verified'
                          ? 'تأیید و انتشار (با اصلاحات AI)'
                          : 'تأیید و انتشار در فهرست'}
                      </span>
                    </button>
                  )}

                  {isReady && ai?.status === 'verified' && (
                    <button
                      type="button"
                      onClick={() => handleApproveSuggestion(sug.id, false)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                    >
                      انتشار با متن خام
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRejectSuggestion(sug.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-red-400 hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>رد کردن</span>
                  </button>
                </div>
              </div>

              {ai && (
                <div className="bg-[#0B0B0E] border border-zinc-800 rounded-lg p-3.5 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-200 inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      <span>گزارش بررسی هوش مصنوعی و ویکی‌پدیا</span>
                    </span>
                    <span
                      className={
                        ai.status === 'verified'
                          ? 'text-emerald-400'
                          : ai.status === 'pending'
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }
                    >
                      {ai.status === 'verified'
                        ? `بررسی کامل شد (اطمینان: ${ai.confidence || 'medium'})`
                        : ai.status === 'pending'
                        ? 'در حال بررسی خودکار...'
                        : ai.error || 'نیازمند بررسی دستی'}
                    </span>
                  </div>

                  {ai.status === 'verified' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-300">
                      <div>
                        <span className="text-zinc-500">چهره‌ی عمومی واقعی: </span>
                        <span className={ai.isRealPublicFigure ? 'text-emerald-400' : 'text-red-400'}>
                          {ai.isRealPublicFigure ? 'تأییدشده' : 'نامشخص'}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">وضعیت تصویر: </span>
                        <span
                          className={
                            ai.imageMatch === 'verified'
                              ? 'text-emerald-400'
                              : ai.imageMatch === 'mismatch'
                              ? 'text-amber-400'
                              : 'text-zinc-400'
                          }
                        >
                          {ai.imageMatch === 'verified'
                            ? 'تطابق چهره تأیید شد'
                            : ai.imageMatch === 'mismatch'
                            ? 'احتمال عدم تطابق تصویر'
                            : 'تصویری در ویکی‌پدیا یافت نشد'}
                        </span>
                      </div>
                      {ai.verifiedName && (
                        <div>
                          <span className="text-zinc-500">نام پیشنهادی اصلاح‌شده: </span>
                          <span className="text-zinc-100">
                            {ai.verifiedName} ({ai.correctedCategory} · {ai.correctedCountry})
                          </span>
                        </div>
                      )}
                      {ai.imageNote && (
                        <div className="text-zinc-400">{ai.imageNote}</div>
                      )}
                      {ai.correctedBio && (
                        <div className="sm:col-span-2 text-zinc-300 leading-relaxed">
                          <span className="text-zinc-500">بیوگرافی پیشنهادی: </span>
                          {ai.correctedBio}
                        </div>
                      )}
                      {ai.verificationNotes && (
                        <div className="sm:col-span-2 text-zinc-400">
                          <span className="text-zinc-500">جمع‌بندی: </span>
                          {ai.verificationNotes}
                        </div>
                      )}
                      {ai.sources && ai.sources.length > 0 && (
                        <div className="sm:col-span-2 flex flex-wrap gap-3 pt-1">
                          {ai.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:underline inline-flex items-center gap-1"
                            >
                              <span>{src.title}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {ai.status === 'error' && (
                    <div className="flex items-start gap-2 text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {ai.error || 'خطا در دریافت تحلیل هوش مصنوعی'}{' '}
                        {ai.verifiedImageUrl
                          ? '(تصویر ویکی‌پدیا به‌صورت مستقیم دریافت شد و در بالا قابل مشاهده است.)'
                          : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-6">
            <div className="bg-[#141418] border border-red-900/60 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 py-3 bg-[#191114] border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    ارسال‌شده به صف تأیید ادمین — رسیده به حدنصاب ۱٬۰۰۰ رأی ({formatPersianNumber(readySuggestions.length)})
                  </span>
                </div>
              </div>
              {readySuggestions.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-400">
                  هنوز پیشنهادی به حدنصاب ۱٬۰۰۰ رأی نرسیده است.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {readySuggestions.map((sug) => renderSuggestionItem(sug, true))}
                </div>
              )}
            </div>

            <div className="bg-[#141418] border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 py-3 bg-[#101014] border-b border-zinc-800 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Clock className="w-4 h-4 text-zinc-400" />
                <span>
                  در حال جمع‌آوری رأی مردمی — زیر ۱٬۰۰۰ رأی ({formatPersianNumber(collectingSuggestions.length)})
                </span>
              </div>
              {collectingSuggestions.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-500">
                  موردی در حال جمع‌آوری رأی نیست.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {collectingSuggestions.map((sug) => renderSuggestionItem(sug, false))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {tab === 'analytics' && (
        <div className="bg-[#141418] border border-zinc-800 rounded-xl p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-zinc-800 rounded-lg p-4 bg-[#0E0E12]">
              <div className="text-xs text-zinc-400">تعداد کل چهره‌ها</div>
              <div className="text-2xl font-bold tabular-nums text-zinc-100 mt-1">
                {formatPersianNumber(figures.length)}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-4 bg-[#0E0E12]">
              <div className="text-xs text-zinc-400">مجموع دیس‌لایک‌ها</div>
              <div className="text-2xl font-bold tabular-nums text-orange-400 mt-1">
                {formatPersianNumber(totalVotes)}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-4 bg-[#0E0E12]">
              <div className="text-xs text-zinc-400">پیشنهادهای در صف</div>
              <div className="text-2xl font-bold tabular-nums text-zinc-100 mt-1">
                {formatPersianNumber(suggestions.length)}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleExportJson}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>دانلود نسخه پشتیبان (JSON)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
