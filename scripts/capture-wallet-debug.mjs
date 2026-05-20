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

  async function dismissErrorOverlay() {
    await page.evaluate(() => {
      const overlay = document.querySelector('nextjs-portal');
      if (overlay) overlay.remove();
      document.querySelectorAll('[data-nextjs-dialog-overlay], [data-nextjs-toast]').forEach(el => el.remove());
      document.querySelectorAll('#__next-build-watcher, [id*="nextjs"]').forEach(el => { if (el.shadowRoot) el.remove(); });
    }).catch(() => {});
  }

  // Navigate to wallet
  await page.goto(`${BASE_URL}/vtrade/wallet`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);

  // Content-height approach (keeps footer visible)
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
  await page.setViewportSize({ width: 1920, height: Math.max(h, 1080) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'wallet.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  console.log('  ✓ wallet.png');

  // Capture additional pages: notifications only
  for (const [path, filename] of [
    ['/vtrade/notifications', 'notifications.png'],
  ]) {
    console.log(`Capturing: ${path}...`);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000);
    await dismissErrorOverlay();
    const ph = await page.evaluate(() => {
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
    console.log(`  Content height: ${ph}`);
    await page.setViewportSize({ width: 1920, height: Math.max(ph, 1080) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUTPUT_DIR, filename), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`  ✓ ${filename}`);
  }

  // Messages — click first conversation before capture
  console.log('Capturing: /vtrade/messages (with first message clicked)...');
  await page.goto(`${BASE_URL}/vtrade/messages`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await dismissErrorOverlay();
  // Click the first message/conversation in the list
  const firstMsg = page.locator('[class*="ConversationList"] button, [class*="ConvScroll"] button').first();
  if (await firstMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstMsg.click();
    await page.waitForTimeout(2000);
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    console.log('  Clicked first message');
  } else {
    console.log('  ⚠ No message item found to click');
  }
  await dismissErrorOverlay();
  const mh = await page.evaluate(() => {
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
  console.log(`  Content height: ${mh}`);
  await page.setViewportSize({ width: 1920, height: Math.max(mh, 1080) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'messages.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  console.log('  ✓ messages.png');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
