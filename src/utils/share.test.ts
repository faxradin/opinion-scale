import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShareMessage,
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
} from './share';

test('buildShareMessage includes Persian rank, name, dislikes, and category', () => {
  const msg = buildShareMessage({
    name: 'دونالد ترامپ',
    rank: 1,
    dislikes: 1840,
    category: 'سیاسی',
  });
  assert.ok(msg.includes('دونالد ترامپ'));
  assert.ok(msg.includes('ترازوی افکار'));
  assert.ok(msg.includes('#۱'));
  assert.ok(msg.includes('۱٬۸۴۰'));
  assert.ok(msg.includes('سیاسی'));
});

test('buildTelegramShareUrl creates valid t.me share URL with encoded params', () => {
  const text = 'متن اشتراک نمونه';
  const url = buildTelegramShareUrl(text, 'https://example.com/list');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://t.me');
  assert.equal(parsed.pathname, '/share/url');
  assert.equal(parsed.searchParams.get('text'), text);
  assert.equal(parsed.searchParams.get('url'), 'https://example.com/list');
});

test('buildWhatsAppShareUrl creates valid wa.me share URL with encoded message and link', () => {
  const text = 'رتبه ۱ - ایلان ماسک';
  const url = buildWhatsAppShareUrl(text, 'https://example.com/list');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://wa.me');
  assert.ok(parsed.searchParams.get('text')?.includes(text));
  assert.ok(parsed.searchParams.get('text')?.includes('https://example.com/list'));
});
