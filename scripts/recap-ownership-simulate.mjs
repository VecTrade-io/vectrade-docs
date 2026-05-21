import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://vectrade.io';
const OUTPUT_DIR = resolve(__dirname, '../guides/vtrade/images');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
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
  const page = await ctx.newPage();

  // Login via /login
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  // Dismiss cookie banner if present
  const cookieBtn = page.locator('button:has-text("Accept All"), button:has-text("Accept")').first();
  if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await cookieBtn.click(); await page.waitForTimeout(500); }

  // Wait for email input to appear
  const email = process.env.VTRADE_EMAIL;
  const password = process.env.VTRADE_PASSWORD;
  if (!email || !password) { console.error('Set VTRADE_EMAIL and VTRADE_PASSWORD env vars'); process.exit(1); }
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form').locator('button[type="submit"]').click();
  try { await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  console.log('Logged in, URL:', page.url());

  // 1. Stock Ownership tab
  console.log('Capturing: stocks ownership tab...');
  await page.goto(`${BASE_URL}/stocks/NASDAQ/NVDA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  const ownershipTab = page.locator('button:has-text("Ownership"), [role="tab"]:has-text("Ownership")').first();
  if (await ownershipTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ownershipTab.click({ force: true });
    await page.waitForTimeout(10000);
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
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
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-stocks-tab-ownership.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  done: vectrade-stocks-tab-ownership.png (height: ${h})`);
  } else {
    console.log('  Ownership tab not found');
  }

  // 2. Analytics Simulate tab
  console.log('Capturing: analytics simulate...');
  await page.goto(`${BASE_URL}/vtrade/analytics`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  const simTab = page.locator('button:has-text("Simulate"), [role="tab"]:has-text("Simulate")').first();
  if (await simTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await simTab.click({ force: true });
    await page.waitForTimeout(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
    const h2 = await page.evaluate(() => {
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
    await page.setViewportSize({ width: 1920, height: Math.max(h2, 1080) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'vectrade-vtrade-analytics-simulate.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  done: vectrade-vtrade-analytics-simulate.png (height: ${h2})`);
  } else {
    console.log('  Simulate tab not found');
  }

  await browser.close();
  console.log('All done');
}

main().catch(e => { console.error(e); process.exit(1); });
