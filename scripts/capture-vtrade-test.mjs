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
      const overlay = document.querySelector('nextjs-portal');
      if (overlay) overlay.remove();
      document.querySelectorAll('[data-nextjs-dialog-overlay], [data-nextjs-toast]').forEach(el => el.remove());
      document.querySelectorAll('#__next-build-watcher, [id*="nextjs"]').forEach(el => {
        if (el.shadowRoot) el.remove();
      });
    }).catch(() => {});
  }

  // Helper: content-height capture
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

  // ═══════════════════════════════════════════════════
  // 1. VTRADE DASHBOARD — /vtrade
  // ═══════════════════════════════════════════════════
  console.log('Capturing: /vtrade (dashboard)...');
  await page.goto(`${BASE_URL}/vtrade`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(6000);
  // Dismiss any "continue" / onboarding button
  const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Get Started"), button:has-text("Accept"), button:has-text("I understand")').first();
  if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continueBtn.click();
    await page.waitForTimeout(2000);
  }
  await captureContentHeight('vtrade-dashboard.png');

  // ═══════════════════════════════════════════════════
  // 2. TRADING DESK — /vtrade/desk
  // ═══════════════════════════════════════════════════
  console.log('Capturing: /vtrade/desk...');
  await page.goto(`${BASE_URL}/vtrade/desk`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await captureContentHeight('trading-desk.png');

  console.log('Capturing: /vtrade/desk/AAPL...');
  await page.goto(`${BASE_URL}/vtrade/desk/AAPL`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await captureContentHeight('trading-desk-aapl.png');

  // ═══════════════════════════════════════════════════
  // 3. WATCHLISTS — /vtrade/watchlists
  // ═══════════════════════════════════════════════════
  console.log('Capturing: /vtrade/watchlists...');
  await page.goto(`${BASE_URL}/vtrade/watchlists`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await captureContentHeight('watchlists.png');

  console.log('\nDone!');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
