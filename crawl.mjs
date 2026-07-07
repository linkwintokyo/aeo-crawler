// AIO(AI Overview)抽出クローラ 検証版
// 使い方: node crawl.mjs --keyword "新宿で不妊鍼といえば" --domain soara-sinkyu.com
// 出力: 標準出力にJSON。--out 指定でファイル保存も可。
// 依存: playwright (chromium)。GitHub ActionsのUbuntu上で動かす前提。

import { chromium } from 'playwright';
import fs from 'fs';

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const KEYWORD = arg('keyword');
const DOMAIN = (arg('domain') || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
const OUT = arg('out');
const SHOT = arg('shot'); // スクショ保存パス（任意）
const HL = arg('hl', 'ja');
const GL = arg('gl', 'jp');
const UULE = arg('uule', ''); // 地域指定(任意, GoogleのUULE文字列)

if (!KEYWORD) { console.error('need --keyword'); process.exit(2); }

const hostOf = u => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0].toLowerCase();

const result = {
  keyword: KEYWORD, domain: DOMAIN, date: new Date().toISOString().slice(0, 10),
  aio_present: false, cited: false, cite_position: 0, sources_count: 0,
  text: '', sources: [], captcha: false, error: null,
};

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
try {
  const ctx = await browser.newContext({
    userAgent: ua, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 2200 },
    extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
  });
  const page = await ctx.newPage();

  let url = `https://www.google.com/search?q=${encodeURIComponent(KEYWORD)}&hl=${HL}&gl=${GL}&pws=0&num=20`;
  if (UULE) url += `&uule=${encodeURIComponent(UULE)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // CAPTCHA/同意ページ検出
  const bodyText0 = (await page.textContent('body').catch(() => '')) || '';
  if (/detected unusual traffic|通常と異なるトラフィック|recaptcha|\/sorry\//i.test(bodyText0) || page.url().includes('/sorry/')) {
    result.captcha = true; throw new Error('captcha/blocked');
  }
  // 同意バナーがあれば同意
  try {
    const consent = await page.$('button:has-text("同意する"), button:has-text("すべて同意"), #L2AGLb');
    if (consent) { await consent.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1500); }
  } catch (e) {}

  // AIOは遅延描画。出現を最大15秒待つ（複数セレクタ候補）
  const aioSelectors = [
    '[data-attrid="SGE"]', 'div[aria-label*="AI"]',
    'div:has-text("AI による概要")', 'div:has-text("AIによる概要")',
    'block-component', '[data-al-viewport]',
  ];
  let aioEl = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !aioEl) {
    for (const sel of aioSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el) { const t = (await el.textContent().catch(() => '')) || ''; if (t.trim().length > 30) { aioEl = el; break; } }
    }
    if (!aioEl) await page.waitForTimeout(1000);
  }
  // 「もっと見る」を押して本文とソースを展開
  if (aioEl) {
    try {
      const more = await page.$('div[role="button"]:has-text("さらに表示"), div[role="button"]:has-text("表示")');
      if (more) { await more.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(1500); }
    } catch (e) {}
    result.aio_present = true;
    result.text = ((await aioEl.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 4000);

    // AIOブロック内のリンクを収集（外部URLのみ、順序保持）
    const links = await aioEl.$$eval('a[href^="http"]', as => as.map(a => a.href)).catch(() => []);
    const seen = new Set();
    let pos = 0;
    for (const href of links) {
      const h = hostOf(href);
      if (!h || h.includes('google.com') || h.includes('gstatic.com') || h.includes('youtube.com/redirect')) continue;
      if (seen.has(href)) continue; seen.add(href);
      pos++;
      result.sources.push({ position: pos, url: href, host: h });
    }
    result.sources_count = result.sources.length;

    if (DOMAIN) {
      const hit = result.sources.find(s => s.host === DOMAIN || s.host.endsWith('.' + DOMAIN) || DOMAIN.endsWith('.' + s.host));
      if (hit) { result.cited = true; result.cite_position = hit.position; }
    }
  }

  if (SHOT) { await page.screenshot({ path: SHOT, fullPage: false }).catch(() => {}); }
} catch (e) {
  result.error = String(e.message || e);
} finally {
  await browser.close();
}

const out = JSON.stringify(result, null, 2);
if (OUT) fs.writeFileSync(OUT, out);
console.log(out);
