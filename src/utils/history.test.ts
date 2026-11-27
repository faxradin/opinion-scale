import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompareMonthlySeries,
  buildFigureDislikeHistory,
  computeCompareSlopeSummary,
  summarizeHistoryWindow,
} from './history';

const FIXED_NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

test('buildFigureDislikeHistory produces 7 points for weekly and 30 for monthly ending at current total', () => {
  const fig = { id: 'fig-trump', dislikes: 1840 };
  const events = [
    { figureId: 'fig-trump', ts: FIXED_NOW - 1000, delta: 12 },
    { figureId: 'fig-trump', ts: FIXED_NOW - DAY_MS, delta: 24 },
  ];

  const weekly = buildFigureDislikeHistory(fig, events, '7d', FIXED_NOW);
  const monthly = buildFigureDislikeHistory(fig, events, '30d', FIXED_NOW);

  assert.equal(weekly.length, 7);
  assert.equal(monthly.length, 30);
  assert.equal(weekly[6].dislikes, 1840);
  assert.equal(weekly[6].dailyDelta, 12);
  assert.equal(weekly[5].dislikes, 1828);
  assert.equal(weekly[5].dailyDelta, 24);
  assert.equal(monthly[29].dislikes, 1840);

  for (let i = 1; i < monthly.length; i += 1) {
    assert.ok(monthly[i].dislikes >= 0);
  }
});

test('summarizeHistoryWindow computes net change, bounds, and peak daily delta', () => {
  const fig = { id: 'fig-putin', dislikes: 1580 };
  const events = [{ figureId: 'fig-putin', ts: FIXED_NOW - 1000, delta: 45 }];
  const weekly = buildFigureDislikeHistory(fig, events, '7d', FIXED_NOW);
  const summary = summarizeHistoryWindow(weekly);

  assert.equal(summary.maxDislikes, 1580);
  assert.ok(summary.minDislikes <= 1580);
  assert.equal(summary.netChange, weekly[6].dislikes - weekly[0].dislikes);
  assert.ok(summary.peakDailyDelta >= 45);
});

test('buildCompareMonthlySeries aligns 30 days for two figures with 0-based growth slopes', () => {
  const figA = { id: 'fig-trump', dislikes: 1840 };
  const figB = { id: 'fig-putin', dislikes: 1580 };
  const events = [
    { figureId: 'fig-trump', ts: FIXED_NOW - 1000, delta: 30 },
    { figureId: 'fig-putin', ts: FIXED_NOW - 2 * DAY_MS, delta: 15 },
  ];

  const series = buildCompareMonthlySeries(figA, figB, events, FIXED_NOW);
  assert.equal(series.length, 30);
  assert.equal(series[0].firstGrowth, 0);
  assert.equal(series[0].secondGrowth, 0);
  assert.equal(series[29].firstTotal, 1840);
  assert.equal(series[29].secondTotal, 1580);
  assert.equal(series[29].firstDaily, 30);
  assert.equal(series[27].secondDaily, 15);
  assert.ok(series[29].firstGrowth > 0);
  assert.ok(series[29].secondGrowth > 0);
});

test('computeCompareSlopeSummary calculates slope acceleration from recent vs prior 7-day windows', () => {
  const fig = { id: 'fig-trump', dislikes: 2000 };
  const acceleratingEvents = [
    { figureId: 'fig-trump', ts: FIXED_NOW - 1 * DAY_MS, delta: 80 },
    { figureId: 'fig-trump', ts: FIXED_NOW - 2 * DAY_MS, delta: 75 },
    { figureId: 'fig-trump', ts: FIXED_NOW - 3 * DAY_MS, delta: 70 },
  ];
  const monthly = buildFigureDislikeHistory(fig, acceleratingEvents, '30d', FIXED_NOW);
  const slope = computeCompareSlopeSummary(monthly);

  assert.ok(slope.netGrowth > 0);
  assert.ok(slope.avgDailySlope > 0);
  assert.ok(slope.recent7dSlope > slope.previous7dSlope);
  assert.equal(slope.momentumTrend, 'accelerating');
});

