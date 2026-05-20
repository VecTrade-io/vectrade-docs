import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = resolve(import.meta.dirname, '../guides/vtrade/images');
mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    storageState: { cookies: [], origins: [{ origin: BASE_URL, localStorage: [{ name: 'cookie-consent', value: JSON.stringify({ analytics: true, marketing: true, functional: true }) }] }] },
  });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').fill('everestkwok@gmail.com');
  await page.locator('input[type="password"]').fill('Password123');
  await page.locator('form button[type="submit"]').click();
  try { await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);
  console.log('Logged in');

  // Helper: dismiss Next.js error overlay if present
  async function dismissErrorOverlay() {
    await page.evaluate(() => {
      // Next.js dev error overlay
      const overlay = document.querySelector('nextjs-portal');
      if (overlay) overlay.remove();
      // Shadow DOM based overlay (Next.js 15+)
      document.querySelectorAll('[data-nextjs-dialog-overlay], [data-nextjs-toast]').forEach(el => el.remove());
      // Generic error overlay containers
      document.querySelectorAll('#__next-build-watcher, [id*="nextjs"]').forEach(el => {
        if (el.shadowRoot) el.remove();
      });
    }).catch(() => {});
  }

  // Helper: content-height capture (with retry on disposed context)
  async function captureContentHeight(filename, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await page.waitForTimeout(500);
        await dismissErrorOverlay();
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
        console.log(`  Content height: ${h}`);
        await page.setViewportSize({ width: 1920, height: Math.max(h, 600) });
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
        await page.setViewportSize({ width: 1920, height: 1080 });
        console.log(`  ✓ ${filename}`);
        return;
      } catch (e) {
        if (attempt < retries && e.message.includes('disposed')) {
          console.log(`  ⚠ Context disposed, retrying (${attempt + 1}/${retries})...`);
          await page.waitForTimeout(2000);
        } else {
          throw e;
        }
      }
    }
  }

  // ── Stock exchange listings ──
  for (const exchange of ['NASDAQ', 'NYSE', 'KOSDAQ']) {
    console.log(`Capturing stocks-${exchange.toLowerCase()}...`);
    await page.goto(`${BASE_URL}/stocks/${exchange}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await captureContentHeight(`stocks-${exchange.toLowerCase()}.png`);
  }

  // ── Stock detail pages ──
  for (const [exchange, ticker] of [['NASDAQ', 'AAPL'], ['NASDAQ', 'NVDA']]) {
    console.log(`Capturing stock-detail-${ticker.toLowerCase()}...`);
    await page.goto(`${BASE_URL}/stocks/${exchange}/${ticker}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await captureContentHeight(`stock-detail-${ticker.toLowerCase()}.png`);
  }

  // ── Stock detail TABS (NVDA) ──
  console.log('Capturing stock detail tabs (NVDA)...');
  await page.goto(`${BASE_URL}/stocks/NASDAQ/NVDA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);

  const stockTabs = ['Summary', 'Options', 'Financials', 'Ownership', 'News', 'Seasonals', 'Filings', 'Profile'];
  for (const tab of stockTabs) {
    try {
      let tabBtn = page.locator(`button:has-text("${tab}")`).first();
      if (await tabBtn.count() > 0) {
        await tabBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (await tabBtn.isVisible().catch(() => false)) {
          await tabBtn.click({ force: true });
          await page.waitForTimeout(4000);
          try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
          await captureContentHeight(`stock-tab-${tab.toLowerCase()}.png`);
        } else {
          console.log(`  ⚠ Tab "${tab}" not visible, skipping`);
        }
      } else {
        console.log(`  ⚠ Tab "${tab}" not found, skipping`);
      }
    } catch (e) {
      if (e.message.includes('disposed')) {
        console.log(`  ⚠ Tab "${tab}" - context disposed, reloading page...`);
        await page.goto(`${BASE_URL}/stocks/NASDAQ/NVDA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
        await page.waitForTimeout(3000);
      } else {
        console.log(`  ⚠ Tab "${tab}" error: ${e.message}`);
      }
    }
  }

  await browser.close();
  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
