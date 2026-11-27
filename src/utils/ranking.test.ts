import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySingleVote,
  applySingleVoteWithPolicy,
  applySuggestionVote,
  CATEGORIES,
  compute24hChanges,
  computeCategoryBreakdown,
  filterFigures,
  getTrendDirection,
  isSafeHttpUrl,
  MAX_VOTE_CHANGES,
  sortFiguresByDislikes,
  SUGGESTION_VOTE_THRESHOLD,
  TWENTY_FOUR_HOURS_MS,
  validateFigureInput,
  VOTE_COOLDOWN_MS,
} from './ranking';
import type { DislikeEvent, FigureSuggestion, PublicFigure } from '../types';

const sampleFigures: PublicFigure[] = [
  {
    id: 'a',
    name: 'شخص اول',
    englishName: 'First Person',
    category: 'سیاسی',
    country: 'آمریکا',
    shortBio: 'بیوگرافی نمونه اول برای آزمون رتبه‌بندی.',
    imageUrl: '/api/figures/a/photo',
    wikiTitleFa: 'شخص_اول',
    wikiTitleEn: 'First_Person',
    dislikes: 120,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'b',
    name: 'شخص دوم',
    englishName: 'Second Person',
    category: 'نظامی و جنگ‌افروز',
    country: 'بریتانیا',
    shortBio: 'بیوگرافی نمونه دوم برای آزمون رتبه‌بندی.',
    imageUrl: '/api/figures/b/photo',
    wikiTitleFa: 'شخص_دوم',
    wikiTitleEn: 'Second_Person',
    dislikes: 280,
    createdAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'c',
    name: 'شخص سوم',
    englishName: 'Third Person',
    category: 'رهبران مذهبی',
    country: 'برزیل',
    shortBio: 'بیوگرافی نمونه سوم برای آزمون رتبه‌بندی.',
    imageUrl: '/api/figures/c/photo',
    wikiTitleFa: 'شخص_سوم',
    wikiTitleEn: 'Third_Person',
    dislikes: 120,
    createdAt: '2026-01-03T00:00:00Z',
  },
];

test('CATEGORIES includes military/warlord and religious leader categories', () => {
  assert.ok(CATEGORIES.includes('نظامی و جنگ‌افروز'));
  assert.ok(CATEGORIES.includes('رهبران مذهبی'));
  assert.equal(CATEGORIES.length, 6);
});

test('sortFiguresByDislikes ranks highest dislikes first and breaks ties by createdAt', () => {
  const ranked = sortFiguresByDislikes(sampleFigures);
  assert.equal(ranked[0].id, 'b');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].id, 'a');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].id, 'c');
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[0].sharePercent, 53.8);
});

test('filterFigures filters by category, search query, and bookmarked IDs', () => {
  const ranked = sortFiguresByDislikes(sampleFigures);
  assert.equal(filterFigures(ranked, { category: 'سیاسی' }).length, 1);
  assert.equal(filterFigures(ranked, { search: 'بریتانیا' })[0].id, 'b');
  assert.equal(
    filterFigures(ranked, { onlyBookmarked: true, bookmarkedIds: ['c'] })[0].id,
    'c'
  );
});

test('computeCategoryBreakdown sums dislikes per category accurately', () => {
  const stats = computeCategoryBreakdown(sampleFigures);
  const military = stats.find((s) => s.category === 'نظامی و جنگ‌افروز');
  assert.ok(military);
  assert.equal(military.count, 1);
  assert.equal(military.totalDislikes, 280);
});

test('validateFigureInput rejects short names, invalid categories, and unsafe image URLs', () => {
  const bad = validateFigureInput({
    name: 'آ',
    category: 'سیاسی',
    country: '',
    shortBio: 'کوتاه',
    imageUrl: 'javascript:alert(1)',
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.name);
  assert.ok(bad.errors.country);
  assert.ok(bad.errors.shortBio);
  assert.ok(bad.errors.imageUrl);

  const good = validateFigureInput({
    name: 'چهره معتبر',
    category: 'رهبران مذهبی',
    country: 'هند',
    shortBio: 'بیوگرافی کامل و بی‌طرفانه درباره این شخصیت شناخته‌شده.',
    imageUrl: '/api/figures/good/photo',
  });
  assert.equal(good.valid, true);
});

test('isSafeHttpUrl allows http/https and rejects javascript/data', () => {
  assert.equal(isSafeHttpUrl('https://fa.wikipedia.org/wiki/Test'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>'), false);
});

test('applySingleVote enforces single choice per visitor', () => {
  const cloned = sampleFigures.map((f) => ({ ...f }));

  // Can unvote a previously chosen figure
  const unvote = applySingleVote(cloned, ['c'], 'c');
  assert.equal(unvote.ok, true);
  assert.equal(unvote.action, 'removed');
  assert.deepEqual(unvote.nextVotedIds, []);
  assert.equal(cloned.find((f) => f.id === 'c')?.dislikes, 119);

  // Normal single-vote flow
  const first = applySingleVote(cloned, [], 'a');
  assert.equal(first.ok, true);
  assert.equal(first.action, 'added');
  assert.deepEqual(first.nextVotedIds, ['a']);
  assert.equal(cloned.find((f) => f.id === 'a')?.dislikes, 121);

  const conflict = applySingleVote(cloned, first.nextVotedIds, 'b');
  assert.equal(conflict.ok, false);
  assert.equal(conflict.action, 'conflict');
  assert.deepEqual(conflict.nextVotedIds, ['a']);
  assert.equal(cloned.find((f) => f.id === 'b')?.dislikes, 280);

  const removed = applySingleVote(cloned, first.nextVotedIds, 'a');
  assert.equal(removed.ok, true);
  assert.equal(removed.action, 'removed');
  assert.deepEqual(removed.nextVotedIds, []);
  assert.equal(cloned.find((f) => f.id === 'a')?.dislikes, 120);
});

test('compute24hChanges and sortFiguresByDislikes compute rising/falling/flat 24h trends', () => {
  const now = 1_700_000_000_000;
  const events: DislikeEvent[] = [
    { figureId: 'a', ts: now - 3600_000, delta: 6 },
    { figureId: 'a', ts: now - 1800_000, delta: -1 },
    { figureId: 'a', ts: now - TWENTY_FOUR_HOURS_MS - 1000, delta: 99 },
    { figureId: 'b', ts: now - 7200_000, delta: -3 },
    { figureId: 'c', ts: now - TWENTY_FOUR_HOURS_MS - 5000, delta: 10 },
  ];

  const changes = compute24hChanges(events, now);
  assert.equal(changes.a, 5);
  assert.equal(changes.b, -3);
  assert.equal(changes.c ?? 0, 0);

  assert.equal(getTrendDirection(5), 'up');
  assert.equal(getTrendDirection(-3), 'down');
  assert.equal(getTrendDirection(0), 'flat');

  const ranked = sortFiguresByDislikes(sampleFigures, events, now);
  const figB = ranked.find((f) => f.id === 'b')!;
  const figA = ranked.find((f) => f.id === 'a')!;
  const figC = ranked.find((f) => f.id === 'c')!;

  assert.equal(figB.change24h, -3);
  assert.equal(figB.trend24h, 'down');
  assert.equal(figA.change24h, 5);
  assert.equal(figA.trend24h, 'up');
  assert.equal(figC.change24h, 0);
  assert.equal(figC.trend24h, 'flat');
});

test('applySuggestionVote increments votes and dispatches to admin queue at 1000 threshold', () => {
  const suggestions: FigureSuggestion[] = [
    {
      id: 'sug-1',
      name: 'نام پیشنهادی',
      englishName: 'Suggested Name',
      category: 'سیاسی',
      country: 'فرانسه',
      shortBio: 'توضیح آزمایشی برای پیشنهاد مردمی.',
      wikiTitleFa: '',
      wikiTitleEn: 'Suggested_Name',
      votes: SUGGESTION_VOTE_THRESHOLD - 1,
      status: 'collecting',
      createdAt: '2026-11-24T00:00:00Z',
    },
  ];

  const reachOutcome = applySuggestionVote(suggestions, [], 'sug-1', '2026-11-25T10:00:00Z');
  assert.equal(reachOutcome.ok, true);
  assert.equal(reachOutcome.action, 'added');
  assert.equal(reachOutcome.reachedThresholdNow, true);
  assert.equal(suggestions[0].votes, 1000);
  assert.equal(suggestions[0].status, 'pending_admin');
  assert.equal(suggestions[0].thresholdReachedAt, '2026-11-25T10:00:00Z');

  // Cannot unvote once sent to admin queue
  const blockedUnvote = applySuggestionVote(suggestions, reachOutcome.nextVotedIds, 'sug-1');
  assert.equal(blockedUnvote.ok, false);
  assert.equal(blockedUnvote.action, 'conflict');
  assert.equal(suggestions[0].votes, 1000);
});

test('isSafeHttpUrl rejects private, loopback, and cloud metadata endpoints', () => {
  assert.equal(isSafeHttpUrl('http://127.0.0.1:8080/admin'), false);
  assert.equal(isSafeHttpUrl('http://localhost/secret'), false);
  assert.equal(isSafeHttpUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isSafeHttpUrl('http://192.168.1.1/'), false);
  assert.equal(isSafeHttpUrl('https://upload.wikimedia.org/wikipedia/commons/test.jpg'), true);
});

test('applySingleVoteWithPolicy locks choice for 48h and caps changes at 5 lifetime switches', () => {
  const cloned = sampleFigures.map((f) => ({ ...f }));
  const t0 = 1_700_000_000_000;

  // Initial choice (selection #1 -> 0 changes used, 5 remaining, locked for 48h)
  const first = applySingleVoteWithPolicy(cloned, [], 'a', undefined, t0);
  assert.equal(first.ok, true);
  assert.equal(first.action, 'added');
  assert.equal(first.nextPolicy?.totalSelections, 1);
  assert.equal(first.nextPolicy?.changesUsed, 0);
  assert.equal(first.nextPolicy?.remainingChanges, MAX_VOTE_CHANGES);
  assert.equal(first.nextPolicy?.lockedUntil, t0 + VOTE_COOLDOWN_MS);

  // Blocked before 48h passes (both cancel and switch)
  const tooEarlyCancel = applySingleVoteWithPolicy(
    cloned,
    first.nextVotedIds,
    'a',
    first.nextPolicy,
    t0 + VOTE_COOLDOWN_MS - 1000
  );
  assert.equal(tooEarlyCancel.ok, false);
  assert.equal(tooEarlyCancel.reason, 'cooldown');

  const tooEarlySwitch = applySingleVoteWithPolicy(
    cloned,
    first.nextVotedIds,
    'b',
    first.nextPolicy,
    t0 + VOTE_COOLDOWN_MS - 1000
  );
  assert.equal(tooEarlySwitch.ok, false);
  assert.equal(tooEarlySwitch.reason, 'cooldown');

  // Perform 5 sequential switches each separated by 48h
  let votedIds = first.nextVotedIds;
  let policy = first.nextPolicy!;
  let now = t0;
  for (let i = 1; i <= MAX_VOTE_CHANGES; i++) {
    now += VOTE_COOLDOWN_MS;
    const nextTarget = votedIds[0] === 'a' ? 'b' : 'a';
    const sw = applySingleVoteWithPolicy(cloned, votedIds, nextTarget, policy, now);
    assert.equal(sw.ok, true);
    assert.equal(sw.action, 'switched');
    assert.equal(sw.nextPolicy?.changesUsed, i);
    assert.equal(sw.nextPolicy?.remainingChanges, MAX_VOTE_CHANGES - i);
    votedIds = sw.nextVotedIds;
    policy = sw.nextPolicy!;
  }

  // After 5 changes, even waiting 48h more cannot change or cancel
  now += VOTE_COOLDOWN_MS * 2;
  const blockedSixth = applySingleVoteWithPolicy(cloned, votedIds, 'a', policy, now);
  assert.equal(blockedSixth.ok, false);
  assert.equal(blockedSixth.reason, 'exhausted');
});
