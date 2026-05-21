import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { parseArgs } from 'util';

// ═══════════════════════════════════════════════════
// CONFIGURATION — override via env vars or CLI args
// ═══════════════════════════════════════════════════
const { values: args } = parseArgs({
  options: {
    url:      { type: 'string', default: process.env.VTRADE_URL      || 'https://uat.vectrade.io' },
    email:    { type: 'string', default: process.env.VTRADE_EMAIL    || '' },
    password: { type: 'string', default: process.env.VTRADE_PASSWORD || '' },
    output:   { type: 'string', default: process.env.VTRADE_OUTPUT   || '' },
  },
  strict: false,
});

const BASE_URL    = args.url.replace(/\/$/, '');
const EMAIL       = args.email;
const PASSWORD    = args.password;
const OUTPUT_DIR  = args.output
  ? resolve(args.output)
  : resolve(import.meta.dirname, '../guides/vtrade/images');

if (!EMAIL || !PASSWORD) {
  console.error('ERROR: VTRADE_EMAIL and VTRADE_PASSWORD env vars are required (or pass --email / --password)');
  process.exit(1);
}

console.log(`Config: url=${BASE_URL} email=${EMAIL} output=${OUTPUT_DIR}\n`);
mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    // Pre-set cookie consent in localStorage to suppress banner
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE_URL,
        localStorage: [{
          name: 'cookie-consent',
          value: JSON.stringify({ analytics: true, marketing: true, functional: true }),
        }],
      }],
    },
  });
  const page = await context.newPage();

  // ═══════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Dismiss cookie banner if present
  const cookieBtnLogin = page.locator('button:has-text("Accept All"), button:has-text("Accept")').first();
  if (await cookieBtnLogin.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cookieBtnLogin.click();
    await page.waitForTimeout(500);
  }

  // Fill login form
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form').locator('button[type="submit"]').click();

  // Wait for login to complete (redirect away from /login)
  try {
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
  } catch {
    console.log('  ⚠ Login redirect not detected, continuing anyway...');
  }
  await page.waitForTimeout(3000);
  console.log('  ✓ Logged in\n');

  /**
   * Find the first VISIBLE button/tab/link matching the given text.
   * Skips hidden mega-menu / sidebar duplicates that match the same text.
   * @param {string} text - text to search for
   * @param {import('playwright').Locator} [scope] - optional scope (e.g. page.locator('main'))
   */
  async function findVisibleTab(text, scope) {
    const root = scope || page;
    const loc = root.locator(`button:has-text("${text}"), [role="tab"]:has-text("${text}"), a:has-text("${text}")`);
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      if (await loc.nth(i).isVisible().catch(() => false)) {
        return loc.nth(i);
      }
    }
    return null;
  }

  /**
   * Dismiss cookie banner if present on current page.
   * Also removes the overlay element from DOM to prevent it blocking clicks.
   * Also removes the public marketing footer if detected.
   */
  async function dismissCookieBanner() {
    const btn = page.locator('button:has-text("Accept All")').first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }
    // Force-remove the cookie overlay from DOM if it's still present
    await page.evaluate(() => {
      document.querySelectorAll('[class*="fsYugY"], [class*="cookie"], [class*="consent"]').forEach(el => el.remove());
    }).catch(() => {});
    // Remove public footer if present
    await removePublicFooter();
  }

  /**
   * Remove the public marketing footer if present.
   * Detects the footer by characteristic text like "Your intelligent market analysis"
   * or link patterns like "Help Center", "Sign Up", "About", "Press".
   */
  async function removePublicFooter() {
    await page.evaluate(() => {
      const footers = document.querySelectorAll('footer');
      for (const f of footers) {
        const text = f.textContent || '';
        if (text.includes('Your intelligent market analysis') ||
            (text.includes('Help Center') && text.includes('Sign Up') && text.includes('About'))) {
          f.remove();
        }
      }
      // Also check non-footer elements that act as public footer
      document.querySelectorAll('section, div').forEach(el => {
        if (el.closest('main')) return; // skip main content
        const text = el.textContent || '';
        if (el.children.length > 3 &&
            text.includes('Your intelligent market analysis') &&
            text.includes('Help Center')) {
          el.remove();
        }
      });
    }).catch(() => {});
  }

  /**
   * Prepare page for clean screenshot capture:
   * - Close command palette / search overlay by pressing Escape
   * - Wait for loading spinners/skeletons to disappear
   * - Hide the floating footer bar to avoid awkward bottom rendering in fullPage
   */
  async function prepareForCapture() {
    // Press Escape to close any open overlays (command palette, dropdowns, modals)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Blur any focused input to dismiss autocomplete dropdowns
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }).catch(() => {});
    await page.waitForTimeout(200);

    // Wait for loading indicators to disappear
    try {
      await page.locator('[class*="loading"], [class*="skeleton"], [class*="spinner"], [data-loading="true"]')
        .first().waitFor({ state: 'hidden', timeout: 8000 });
    } catch { /* no loading indicator or already gone */ }

    // Remove any open overlays and clean up for screenshot
    await page.evaluate(() => {
      // Remove command palette overlay
      document.querySelectorAll('[cmdk-overlay], [cmdk-root]').forEach(el => el.remove());
      // Remove BottomNav elements explicitly (z-index 50-61, leaks in fullPage)
      document.querySelectorAll('[class*="BottomNav"]').forEach(el => el.remove());
      // Remove any fixed overlays (cookie consent, modals, toasts) — keep layout chrome
      document.querySelectorAll('div').forEach(el => {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') {
          el.remove();
        }
      });
      // Force the layout wrapper to exact viewport height so footer stays in view
      const main = document.querySelector('main');
      const wrapper = main?.parentElement?.parentElement;
      if (wrapper) {
        wrapper.style.height = '100vh';
        wrapper.style.minHeight = 'unset';
      }
      if (main?.parentElement) {
        main.parentElement.style.minHeight = '0';
      }
    }).catch(() => {});
  }

  /**
   * Navigate and wait for content to render before capturing.
   * - Waits for domcontentloaded, then networkidle (with short timeout fallback)
   * - Additional wait for dynamic data to populate
   * - Dismisses any cookie banner that appears despite localStorage
   */
  async function capture(url, filename, opts = {}) {
    console.log(`Capturing: ${url} → ${filename}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      // Wait for network to settle (data fetching)
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch { /* proceed even if some long-polling remains */ }

      // Extra wait for JS rendering / animations
      await page.waitForTimeout(opts.wait || 4000);

      // Dismiss cookie banner if still visible
      const cookieBtn = page.locator('button:has-text("Accept All"), button:has-text("Accept")').first();
      if (await cookieBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await cookieBtn.click();
        await page.waitForTimeout(500);
      }

      // If user specified a selector to wait for, wait for it to be visible
      if (opts.waitFor) {
        try {
          await page.locator(opts.waitFor).first().waitFor({ state: 'visible', timeout: 10000 });
        } catch { /* best effort */ }
      }

      // Prepare page for clean capture (dismiss overlays, wait for loading)
      await prepareForCapture();

      if (opts.selector) {
        const el = await page.locator(opts.selector).first();
        await el.screenshot({ path: resolve(OUTPUT_DIR, filename) });
      } else {
        await page.screenshot({
          path: resolve(OUTPUT_DIR, filename),
          fullPage: opts.fullPage !== false, // fullPage by default
        });
      }
      console.log(`  ✓ saved`);
    } catch (e) {
      console.log(`  ✗ failed: ${e.message.split('\n')[0]}`);
    }
  }

  // ═══════════════════════════════════════════════════
  // VTRADE DASHBOARD (has loading overlay — wait for it to disappear)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: dashboard (waiting for loading overlay)...');
  await page.goto(`${BASE_URL}/vtrade`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  // Wait for loading overlay / splash to disappear
  try {
    await page.locator('[data-loading], .loading-overlay, .splash-screen').waitFor({ state: 'hidden', timeout: 10000 });
  } catch { /* may not have an explicit overlay selector */ }
  await page.waitForTimeout(6000); // extra wait for dashboard data
  // Dismiss any "continue" / "accept" / "I understand" button that appears on first visit
  const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Get Started"), button:has-text("Accept"), button:has-text("I understand"), button:has-text("Understand")').first();
  if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continueBtn.click();
    await page.waitForTimeout(2000);
  }
  // Dismiss cookie banner too
  await dismissCookieBanner();
  {
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-home.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  console.log('  ✓ vectrade-vtrade-home.png');

  // ═══════════════════════════════════════════════════
  // MARKET PAGES (tabs have long loading — extra wait)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: market page + tabs...');
  await page.goto(`${BASE_URL}/vtrade/market`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
  await page.waitForTimeout(10000); // long loading for market data
  await page.evaluate(() => {
    document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
    const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    const body = main?.parentElement;
    if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
    const wrapper = body?.parentElement;
    if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = 'auto'; }
  });
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-market-overview.png'), fullPage: true });
  console.log('  ✓ vectrade-vtrade-market-overview.png');

  const marketTabs = ['Equities', 'ETFs', 'Crypto', 'Forex', 'Commodities', 'Indices'];
  await dismissCookieBanner();
  for (const tab of marketTabs) {
    // Re-navigate to market page for each tab to avoid stale state
    await page.goto(`${BASE_URL}/vtrade/market`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(4000);
    let tabBtn = await findVisibleTab(tab);
    // If tab not visible, try scrolling the tab bar to reveal it
    if (!tabBtn) {
      const hidden = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
      if (await hidden.count() > 0) {
        await hidden.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        if (await hidden.isVisible().catch(() => false)) {
          tabBtn = hidden;
        }
      }
    }
    if (tabBtn) {
      await tabBtn.click({ force: true });
      await page.waitForTimeout(10000); // market tabs need more time to load data
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      await page.evaluate(() => {
        document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
        const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
        if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
        const body = main?.parentElement;
        if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
        const wrapper = body?.parentElement;
        if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = 'auto'; }
      });
      await page.screenshot({ path: resolve(OUTPUT_DIR, `vectrade-vtrade-market-${tab.toLowerCase()}.png`), fullPage: true });
      console.log(`  ✓ vectrade-vtrade-market-${tab.toLowerCase()}.png`);
    } else {
      console.log(`  ⚠ Market tab "${tab}" not found, skipping`);
    }
  }

  // ── Stock exchange listings (content-height approach) ──
  for (const exchange of ['NASDAQ', 'NYSE', 'KOSDAQ']) {
    console.log(`Capturing stocks-${exchange.toLowerCase()}...`);
    await page.goto(`${BASE_URL}/stocks/${exchange}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await dismissCookieBanner();
    {
      const h = await page.evaluate(() => {
        document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
        const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
        if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
        const body = main?.parentElement;
        if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
        const wrapper = body?.parentElement;
        if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
        const nextRoot = document.getElementById('__next');
        if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
        document.documentElement.style.height = 'auto';
        document.body.style.height = 'auto';
        document.body.style.minHeight = '0';
        document.body.offsetHeight;
        return document.body.scrollHeight;
      });
      await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(OUTPUT_DIR, `vectrade-stocks-${exchange.toLowerCase()}.png`), fullPage: true });
      await page.setViewportSize({ width: 1920, height: 1080 });
      console.log(`  ✓ vectrade-stocks-${exchange.toLowerCase()}.png`);
    }
  }

  // ── Stock detail pages (content-height approach) ──
  for (const [exchange, ticker] of [['NASDAQ', 'AAPL'], ['NASDAQ', 'NVDA']]) {
    console.log(`Capturing stock-detail-${ticker.toLowerCase()}...`);
    await page.goto(`${BASE_URL}/stocks/${exchange}/${ticker}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await dismissCookieBanner();
    {
      const h = await page.evaluate(() => {
        document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
        const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
        if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
        const body = main?.parentElement;
        if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
        const wrapper = body?.parentElement;
        if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
        const nextRoot = document.getElementById('__next');
        if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
        document.documentElement.style.height = 'auto';
        document.body.style.height = 'auto';
        document.body.style.minHeight = '0';
        document.body.offsetHeight;
        return document.body.scrollHeight;
      });
      await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(OUTPUT_DIR, `vectrade-stocks-detail-${ticker.toLowerCase()}.png`), fullPage: true });
      await page.setViewportSize({ width: 1920, height: 1080 });
      console.log(`  ✓ vectrade-stocks-detail-${ticker.toLowerCase()}.png`);
    }
  }

  // ── Stock detail TABS (using NVDA as example) ──
  console.log('Capturing stock detail tabs (NVDA)...');
  await page.goto(`${BASE_URL}/stocks/NASDAQ/NVDA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);

  const stockTabs = ['Summary', 'Options', 'Financials', 'Ownership', 'News', 'Seasonals', 'Filings', 'Profile'];
  await dismissCookieBanner();
  for (const tab of stockTabs) {
    try {
      let tabBtn = await findVisibleTab(tab);
      if (!tabBtn) {
        const hidden = page.locator(`button:has-text("${tab}")`).first();
        if (await hidden.count() > 0) {
          await hidden.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(500);
          if (await hidden.isVisible().catch(() => false)) {
            tabBtn = hidden;
          }
        }
      }
      if (tabBtn) {
        await tabBtn.click({ force: true });
        // Ownership tab has heavy charts that need extra loading time
        const tabWait = tab === 'Ownership' ? 10000 : 4000;
        await page.waitForTimeout(tabWait);
        try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
        if (tab === 'Ownership') await page.waitForTimeout(5000); // extra wait for chart rendering
        await page.waitForTimeout(500);
        const h = await page.evaluate(() => {
          document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
          document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
          const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
          if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
          const body = main?.parentElement;
          if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
          const wrapper = body?.parentElement;
          if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
          const nextRoot = document.getElementById('__next');
          if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
          document.documentElement.style.height = 'auto';
          document.body.style.height = 'auto';
          document.body.style.minHeight = '0';
          document.body.offsetHeight;
          return document.body.scrollHeight;
        });
        await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(OUTPUT_DIR, `vectrade-stocks-tab-${tab.toLowerCase()}.png`), fullPage: true });
        await page.setViewportSize({ width: 1920, height: 1080 });
        console.log(`  ✓ vectrade-stocks-tab-${tab.toLowerCase()}.png`);
      } else {
        console.log(`  ⚠ Tab "${tab}" not found, skipping`);
      }
    } catch (e) {
      if (e.message.includes('disposed')) {
        console.log(`  ⚠ Tab "${tab}" - context disposed, reloading...`);
        await page.goto(`${BASE_URL}/stocks/NASDAQ/NVDA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
        await page.waitForTimeout(3000);
      } else {
        console.log(`  ⚠ Tab "${tab}" error: ${e.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // TRADING DESK (content-height approach)
  // ═══════════════════════════════════════════════════
  for (const [path, filename] of [['/vtrade/desk', 'vectrade-vtrade-trade-overview.png'], ['/vtrade/desk/AAPL', 'vectrade-vtrade-trade-aapl.png']]) {
    console.log(`Capturing: ${path}...`);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await dismissCookieBanner();
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ ${filename}`);
  }

  // ═══════════════════════════════════════════════════
  // PORTFOLIO (tabs: Summary, Positions, Performance, Risk, Attribution)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: portfolio + tabs...');
  await page.goto(`${BASE_URL}/vtrade/portfolio`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  {
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: h });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-portfolio-overview.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log('  ✓ vectrade-vtrade-portfolio-overview.png');
  }

  const portfolioTabs = [
    ['history', 'vectrade-vtrade-portfolio-history.png'],
    ['snapshots', 'vectrade-vtrade-portfolio-snapshots.png'],
  ];
  for (const [subpath, filename] of portfolioTabs) {
    await page.goto(`${BASE_URL}/vtrade/portfolio/${subpath}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch {}
    await page.waitForTimeout(4000);
    await dismissCookieBanner();
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ ${filename}`);
  }

  // ═══════════════════════════════════════════════════
  // WALLET, WATCHLISTS (content-height approach)
  // ═══════════════════════════════════════════════════
  for (const [path, filename] of [['/vtrade/wallet', 'vectrade-vtrade-wallet.png'], ['/vtrade/watchlists', 'vectrade-vtrade-watchlists.png']]) {
    console.log(`Capturing: ${path}...`);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await dismissCookieBanner();
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ ${filename}`);
  }

  // ═══════════════════════════════════════════════════
  // ANALYTICS (tabs: Simulate, Screener, Performance Calendar, Cash Flow, Rebalance)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: analytics + tabs...');
  await page.goto(`${BASE_URL}/vtrade/analytics`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await dismissCookieBanner();
  // For overview: flatten scroll container for fullPage capture
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelectorAll('[cmdk-overlay], [cmdk-root]').forEach(el => el.remove());
    document.querySelectorAll('[class*="BottomNav"]').forEach(el => el.remove());
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') {
        el.remove();
      }
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  }).catch(() => {});
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-analytics-overview.png'), fullPage: true });
  console.log('  ✓ vectrade-vtrade-analytics-overview.png');

  const analyticsTabs = [
    ['screener', 'vectrade-vtrade-analytics-screener.png', 10000],
    ['calendar', 'vectrade-vtrade-analytics-calendar.png', 5000],
    ['cashflow', 'vectrade-vtrade-analytics-cashflow.png', 5000],
    ['rebalance', 'vectrade-vtrade-analytics-rebalance.png', 5000],
  ];
  for (const [subpath, filename, wait] of analyticsTabs) {
    await page.goto(`${BASE_URL}/vtrade/analytics/${subpath}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(wait);
    await dismissCookieBanner();

    // For Screener: click Search button to populate results
    if (subpath === 'screener') {
      const searchBtn = page.locator('main button:has-text("Search")').first();
      if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchBtn.click();
        await page.waitForTimeout(5000);
        try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
        await page.waitForTimeout(5000);
      }
    }

    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; main.style.minHeight = '0'; }
      // Walk up from main removing all height constraints
      let ancestor = main?.parentElement;
      while (ancestor && ancestor !== document.documentElement) {
        ancestor.style.overflow = 'visible';
        ancestor.style.height = 'auto';
        ancestor.style.minHeight = '0';
        ancestor = ancestor.parentElement;
      }
      document.documentElement.style.height = 'auto';
      document.documentElement.style.minHeight = '0';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight; // force reflow
      // Use main bounding rect for actual content height
      const contentBottom = main ? main.getBoundingClientRect().bottom : document.body.scrollHeight;
      return Math.ceil(contentBottom);
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 800) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ ${filename}`);
  }

  // ═══════════════════════════════════════════════════
  // COPILOT
  // ═══════════════════════════════════════════════════

  // Copilot Chat Message — click first conversation in sidebar (capture FIRST so we land on seeded chat)
  console.log('Capturing: copilot-chat-message (fullPage)...');
  await page.goto(`${BASE_URL}/vtrade/copilot/new`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);
  await dismissCookieBanner();
  const convLink = page.locator('a[href*="/vtrade/copilot/"]:not([href*="/new"])').first();
  if (await convLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await convLink.click();
    await page.waitForTimeout(3000);
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(3000);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelectorAll('[cmdk-overlay], [cmdk-root]').forEach(el => el.remove());
    document.querySelectorAll('[class*="BottomNav"]').forEach(el => el.remove());
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') {
        el.remove();
      }
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  }).catch(() => {});
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-copilot-chat.png'), fullPage: true });
  console.log('  ✓ vectrade-vtrade-copilot-chat.png');

  // Copilot New Chat — intercept quota to prevent free-tier auto-redirect, then fresh navigate
  console.log('Capturing: copilot-chat-new (fullPage)...');
  await page.route('**/copilot/sessions/access', async route => {
    const resp = await route.fetch();
    const body = await resp.json();
    body.tier = 'professional';
    await route.fulfill({ response: resp, json: body });
  });
  await page.goto(`${BASE_URL}/vtrade/copilot/new`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(4000);
  await page.unroute('**/copilot/sessions/access');
  await dismissCookieBanner();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelectorAll('[cmdk-overlay], [cmdk-root]').forEach(el => el.remove());
    document.querySelectorAll('[class*="BottomNav"]').forEach(el => el.remove());
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') {
        el.remove();
      }
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  }).catch(() => {});
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-copilot-new.png'), fullPage: true });
  console.log('  ✓ vectrade-vtrade-copilot-new.png');

  // ═══════════════════════════════════════════════════
  // SOCIAL & LEADERBOARD (content-height approach)
  // ═══════════════════════════════════════════════════
  for (const [path, filename] of [
    ['/vtrade/leaderboard', 'vectrade-vtrade-leaderboard.png'],
    ['/vtrade/profile/edit', 'vectrade-vtrade-profile.png'],
    ['/vtrade/notifications', 'vectrade-vtrade-alerts.png'],
    ['/people', 'vectrade-people.png'],
  ]) {
    console.log(`Capturing: ${path}...`);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await dismissCookieBanner();

    // Blur sensitive fields on profile/edit page
    if (path === '/vtrade/profile/edit') {
      await page.evaluate(() => {
        document.querySelectorAll('input').forEach(el => {
          const name = (el.name || el.id || el.placeholder || '').toLowerCase();
          const label = el.closest('label')?.textContent?.toLowerCase() || '';
          const prev = el.parentElement?.previousElementSibling?.textContent?.toLowerCase() || '';
          if (name.includes('email') || name.includes('name') || name.includes('display')
            || label.includes('email') || label.includes('name')
            || prev.includes('email') || prev.includes('name')) {
            el.style.filter = 'blur(6px)';
            el.style.userSelect = 'none';
          }
        });
      });
    }

    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 1080) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ ${filename}`);
  }

  // Messages — click first conversation before capture
  console.log('Capturing: /vtrade/messages (with first conversation clicked)...');
  await page.goto(`${BASE_URL}/vtrade/messages`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await dismissCookieBanner();
  {
    const firstMsg = page.locator('[class*="ConversationList"] button, [class*="ConvScroll"] button').first();
    if (await firstMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstMsg.click();
      await page.waitForTimeout(2000);
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    }
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 1080) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-messages.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log('  ✓ vectrade-vtrade-messages.png');
  }

  await capture(`${BASE_URL}/vtrade/groups`, 'vectrade-vtrade-groups.png', { wait: 4000 });

  // Group tabs & create
  console.log('Capturing: groups-my (My Groups tab)...');
  await page.goto(`${BASE_URL}/vtrade/groups`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(4000);
  const myGroupsTab = await findVisibleTab('My Groups');
  if (myGroupsTab) {
    await myGroupsTab.click({ force: true });
    await page.waitForTimeout(3000);
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  }
  await prepareForCapture();
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-groups-my.png'), fullPage: true });
  console.log('  ✓ vectrade-vtrade-groups-my.png');

  console.log('Capturing: groups-create (Create Group)...');
  try {
    await page.locator('text=Create Group').first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-groups-create.png') });
    console.log('  ✓ vectrade-vtrade-groups-create.png');
  } catch {
    console.log('  ⚠ Create Group button not found, skipping');
  }

  await capture(`${BASE_URL}/vtrade/competitions`, 'vectrade-vtrade-competition.png', { wait: 5000 });
  // Navigate to seasonal
  console.log('Capturing: competitions/seasonal...');
  await page.goto(`${BASE_URL}/vtrade/competitions/seasonal`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await dismissCookieBanner();
  await prepareForCapture();
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-competition-seasonal.png') });
  console.log('  ✓ vectrade-vtrade-competition-seasonal.png');

  // ═══════════════════════════════════════════════════
  // GAMIFICATION & PROFILE
  // ═══════════════════════════════════════════════════

  // Missions — content-height capture (page is shorter than viewport)
  console.log('Capturing: missions...');
  await page.goto(`${BASE_URL}/vtrade/missions`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(4000);
  {
    const contentHeight = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: contentHeight });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-missions.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log('  ✓ vectrade-vtrade-missions.png');
  }

  await capture(`${BASE_URL}/vtrade/feed`, 'vectrade-vtrade-feed.png', { wait: 5000 });
  await capture(`${BASE_URL}/vtrade/feed?tab=people`, 'vectrade-vtrade-feed-people.png', { wait: 5000 });
  await capture(`${BASE_URL}/vtrade/feed?tab=hashtags`, 'vectrade-vtrade-feed-hashtags.png', { wait: 5000 });

  // Quiz — long loading, wait for content to appear
  console.log('Capturing: quiz...');
  await page.goto(`${BASE_URL}/vtrade/quiz`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
  try {
    await page.locator('text=Loading').waitFor({ state: 'hidden', timeout: 15000 });
  } catch {}
  await page.waitForTimeout(5000);
  {
    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-quiz.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log('  ✓ vectrade-vtrade-quiz.png');
  }

  // ═══════════════════════════════════════════════════
  // DEVELOPER (tabs: Overview, API Keys, Usage, Quick Start, API Docs, Changelog)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: developer + tabs...');
  await page.goto(`${BASE_URL}/vtrade/developer`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await dismissCookieBanner();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelectorAll('[cmdk-overlay], [cmdk-root]').forEach(el => el.remove());
    document.querySelectorAll('[class*="BottomNav"]').forEach(el => el.remove());
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') {
        el.remove();
      }
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  }).catch(() => {});
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-developer.png'), fullPage: true });
  console.log('  ✓ vectrade-vtrade-developer.png');

  const developerTabs = ['Overview', 'API Keys', 'Usage'];
  await dismissCookieBanner();
  for (const tab of developerTabs) {
    const tabBtn = await findVisibleTab(tab);
    if (tabBtn) {
      await tabBtn.click({ force: true });
      await page.waitForTimeout(3000);
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
      await page.evaluate(() => {
        document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
        const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
        if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
        const body = main?.parentElement;
        if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
        const wrapper = body?.parentElement;
        if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = 'auto'; }
      });
      const slug = tab.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({ path: resolve(OUTPUT_DIR, `vectrade-vtrade-developer-${slug}.png`), fullPage: true });
      console.log(`  ✓ vectrade-vtrade-developer-${slug}.png`);
    } else {
      console.log(`  ⚠ Developer tab "${tab}" not found, skipping`);
    }
  }

  // ═══════════════════════════════════════════════════
  // SETTINGS (tabs: Account, Sessions, Language & Region, Appearance, Notifications, Preferences, Legal)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: settings + tabs...');
  const settingsSections = ['Account', 'Sessions', 'Language & Region', 'Appearance', 'Notifications', 'Preferences', 'Legal'];
  for (const section of settingsSections) {
    const slug = section.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-');
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(3000);
    if (section !== 'Account') {
      const tabBtn = page.locator(`button:has-text("${section}")`).first();
      if (await tabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Blur sensitive fields on Account section
    if (section === 'Account') {
      await page.evaluate(() => {
        document.querySelectorAll('input').forEach(el => {
          const name = (el.name || el.id || el.placeholder || '').toLowerCase();
          const label = el.closest('label')?.textContent?.toLowerCase() || '';
          const prev = el.parentElement?.previousElementSibling?.textContent?.toLowerCase() || '';
          if (name.includes('email') || name.includes('name') || name.includes('display')
            || label.includes('email') || label.includes('name')
            || prev.includes('email') || prev.includes('name')) {
            el.style.filter = 'blur(6px)';
            el.style.userSelect = 'none';
          }
        });
      });
    }

    const h = await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('*').forEach(el => { if (getComputedStyle(el).zIndex >= 90 && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
      const main = document.querySelector('main') || document.querySelector('[class*="Main"]');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      const body = main?.parentElement;
      if (body) { body.style.overflow = 'visible'; body.style.height = 'auto'; }
      const wrapper = body?.parentElement;
      if (wrapper) { wrapper.style.overflow = 'visible'; wrapper.style.height = 'auto'; wrapper.style.minHeight = '0'; }
      const nextRoot = document.getElementById('__next');
      if (nextRoot) { nextRoot.style.height = 'auto'; nextRoot.style.minHeight = '0'; }
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.body.offsetHeight;
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, `vectrade-settings-${slug}.png`), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ vectrade-settings-${slug}.png`);
  }

  await browser.close();
  console.log(`\nDone! ${Object.keys(OUTPUT_DIR).length || 'All'} screenshots saved to: ${OUTPUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
