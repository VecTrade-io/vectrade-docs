import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL   = 'http://localhost:3000';
const EMAIL      = 'everestkwok@gmail.com';
const PASSWORD   = 'Password123';
const OUTPUT_DIR = resolve(import.meta.dirname, '../guides/vtrade/images');

console.log(`Config: url=${BASE_URL} output=${OUTPUT_DIR}\n`);
mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
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
  const page = await context.newPage();

  // ═══════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  const cookieBtnLogin = page.locator('button:has-text("Accept All"), button:has-text("Accept")').first();
  if (await cookieBtnLogin.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cookieBtnLogin.click();
    await page.waitForTimeout(500);
  }

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form').locator('button[type="submit"]').click();

  try {
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
  } catch {
    console.log('  ⚠ Login redirect not detected, continuing anyway...');
  }
  await page.waitForTimeout(3000);
  console.log('  ✓ Logged in\n');

  // ═══════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════
  async function findVisibleTab(text) {
    const loc = page.locator(`button:has-text("${text}"), [role="tab"]:has-text("${text}"), a:has-text("${text}")`);
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      if (await loc.nth(i).isVisible().catch(() => false)) {
        return loc.nth(i);
      }
    }
    return null;
  }

  async function prepareForCapture() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }).catch(() => {});
    await page.waitForTimeout(200);

    try {
      await page.locator('[class*="loading"], [class*="skeleton"], [class*="spinner"], [data-loading="true"]')
        .first().waitFor({ state: 'hidden', timeout: 8000 });
    } catch {}

    await page.evaluate(() => {
      // Remove command palette overlays
      document.querySelectorAll('[cmdk-overlay], [cmdk-root]').forEach(el => el.remove());

      // Remove BottomNav elements explicitly (z-index 50-61, leaks in fullPage)
      document.querySelectorAll('[class*="BottomNav"]').forEach(el => el.remove());

      // Remove other fixed overlays (cookie consent, modals, toasts) — keep layout chrome
      document.querySelectorAll('div').forEach(el => {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') {
          el.remove();
        }
      });

      // Force the layout wrapper to exact viewport height so footer stays in view
      // (Wrapper uses min-height:100vh which allows content to push footer off-screen)
      const main = document.querySelector('main');
      const wrapper = main?.parentElement?.parentElement;
      if (wrapper) {
        wrapper.style.height = '100vh';
        wrapper.style.minHeight = 'unset';
      }
      // Ensure Body doesn't overflow — let Main scroll internally
      if (main?.parentElement) {
        main.parentElement.style.minHeight = '0';
      }
    }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════
  // CAPTURE: Analytics Overview (fullPage — content extends beyond viewport)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Analytics Overview...');
  await page.goto(`${BASE_URL}/vtrade/analytics`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  // For overview: remove BottomNav but keep wrapper flexible for fullPage
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
    // Flatten scroll container so fullPage captures all content
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  }).catch(() => {});
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'analytics-overview.png'), fullPage: true });
  console.log('  ✓ analytics-overview.png');

  // ═══════════════════════════════════════════════════
  // CAPTURE: Analytics → Cash Flow tab
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Analytics Cash Flow...');
  await page.goto(`${BASE_URL}/vtrade/analytics`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);

  const tabBtn = await findVisibleTab('Cash Flow');
  if (tabBtn) {
    await tabBtn.click({ force: true });
    await page.waitForTimeout(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}

    // fullPage approach: remove BottomNav, flatten scroll containers
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
      // Flatten scroll container so fullPage captures all content
      const main = document.querySelector('main');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
    }).catch(() => {});

    await page.screenshot({ path: resolve(OUTPUT_DIR, 'analytics-cashflow.png'), fullPage: true });
    console.log('  ✓ analytics-cashflow.png');
  } else {
    console.log('  ⚠ Cash Flow tab not found!');
  }

  // ═══════════════════════════════════════════════════
  // CAPTURE: Analytics → Rebalance tab
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Analytics Rebalance...');
  await page.goto(`${BASE_URL}/vtrade/analytics`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);

  const rebalanceBtn = await findVisibleTab('Rebalance');
  if (rebalanceBtn) {
    await rebalanceBtn.click({ force: true });
    await page.waitForTimeout(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
    await prepareForCapture();
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'analytics-rebalance.png') });
    console.log('  ✓ analytics-rebalance.png');
  } else {
    console.log('  ⚠ Rebalance tab not found!');
  }

  // ═══════════════════════════════════════════════════
  // CAPTURE: Analytics → Screener tab (click Search, wait for results)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Analytics Screener...');
  await page.goto(`${BASE_URL}/vtrade/analytics`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);

  const screenerBtn = await findVisibleTab('Screener');
  if (screenerBtn) {
    await screenerBtn.click({ force: true });
    await page.waitForTimeout(3000);
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}

    // Click the Search button inside main (not the command palette Search in header)
    const searchBtn = page.locator('main button:has-text("Search")').first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      // Wait for results table/data to appear
      await page.waitForTimeout(5000);
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      await page.waitForTimeout(5000);
    }

    await prepareForCapture();
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'analytics-screener.png') });
    console.log('  ✓ analytics-screener.png');
  } else {
    console.log('  ⚠ Screener tab not found!');
  }

  // ═══════════════════════════════════════════════════
  // CAPTURE: Competitions
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Competitions...');
  await page.goto(`${BASE_URL}/vtrade/competitions`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await prepareForCapture();
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'competitions.png') });
  console.log('  ✓ competitions.png');

  // ═══════════════════════════════════════════════════
  // CAPTURE: Competitions Seasonal
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Competitions Seasonal...');
  await page.goto(`${BASE_URL}/vtrade/competitions/seasonal`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);
  await prepareForCapture();
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'competitions-seasonal.png') });
  console.log('  ✓ competitions-seasonal.png');

  // ═══════════════════════════════════════════════════
  // CAPTURE: Copilot Chat New (fullPage)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Copilot Chat New...');
  await page.goto(`${BASE_URL}/vtrade/copilot/new`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);

  // fullPage approach: flatten scroll containers
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
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'copilot-chat-new.png'), fullPage: true });
  console.log('  ✓ copilot-chat-new.png');

  // ═══════════════════════════════════════════════════
  // CAPTURE: Copilot Chat Message (click first conversation)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Copilot Chat Message...');
  await page.goto(`${BASE_URL}/vtrade/copilot/new`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);

  // Click the first conversation in the sidebar list
  const convLink = page.locator('a[href*="/vtrade/copilot/"]:not([href*="/new"])').first();
  if (await convLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await convLink.click();
    await page.waitForTimeout(3000);
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(3000);
  }

  // fullPage approach
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
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'copilot-chat-message.png'), fullPage: true });
  console.log('  ✓ copilot-chat-message.png');

  // ═══════════════════════════════════════════════════
  // CAPTURE: Developer Portal (fullPage)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: Developer Portal...');
  await page.goto(`${BASE_URL}/vtrade/developer`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);

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
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'developer-portal.png'), fullPage: true });
  console.log('  ✓ developer-portal.png');

  // ── Developer Tab Screenshots ──
  const developerTabs = ['Overview', 'API Keys', 'Usage'];
  for (const tab of developerTabs) {
    const tabBtn = page.locator(`role=tab[name="${tab}"]`).first()
      .or(page.locator(`button:has-text("${tab}")`).first())
      .or(page.locator(`[role="tablist"] >> text="${tab}"`).first());
    try {
      await tabBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
      await page.evaluate(() => {
        document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('div').forEach(el => {
          const style = getComputedStyle(el);
          if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') el.remove();
        });
        const main = document.querySelector('main');
        if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
        if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
      });
      const slug = tab.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({ path: resolve(OUTPUT_DIR, `developer-tab-${slug}.png`), fullPage: true });
      console.log(`  ✓ developer-tab-${slug}.png`);
    } catch {
      console.log(`  ⚠ Developer tab "${tab}" not found, skipping`);
    }
  }

  // ═══════════════════════════════════════════════════
  // CAPTURE: Feed (fullPage)
  // ═══════════════════════════════════════════════════
  const feedPages = [
    { url: `${BASE_URL}/vtrade/feed`, name: 'feed.png' },
    { url: `${BASE_URL}/vtrade/feed?tab=people`, name: 'feed-people.png' },
    { url: `${BASE_URL}/vtrade/feed?tab=hashtags`, name: 'feed-hashtag.png' },
  ];
  for (const { url, name } of feedPages) {
    console.log(`Capturing: ${name}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('div').forEach(el => {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') el.remove();
      });
      const main = document.querySelector('main');
      if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
      if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
    });
    await page.screenshot({ path: resolve(OUTPUT_DIR, name), fullPage: true });
    console.log(`  ✓ ${name}`);
  }

  // ═══════════════════════════════════════════════════
  // CAPTURE: Groups (fullPage)
  // ═══════════════════════════════════════════════════
  console.log('Capturing: groups.png...');
  await page.goto(`${BASE_URL}/vtrade/groups`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') el.remove();
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  });
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'groups.png'), fullPage: true });
  console.log('  ✓ groups.png');

  // My Groups tab
  console.log('Capturing: groups-my.png...');
  await page.locator('button:has-text("My Groups")').first().click({ timeout: 5000 });
  await page.waitForTimeout(3000);
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.evaluate(() => {
    document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') el.remove();
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  });
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'groups-my.png'), fullPage: true });
  console.log('  ✓ groups-my.png');

  // Create Group - click the button to open modal
  console.log('Capturing: groups-create.png...');
  await page.locator('text=Create Group').first().click({ timeout: 5000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'groups-create.png') });
  console.log('  ✓ groups-create.png');

  // ═══════════════════════════════════════════════════
  // CAPTURE: Market (fullPage) — needs longer wait for data
  // ═══════════════════════════════════════════════════
  console.log('Capturing: market.png...');
  await page.goto(`${BASE_URL}/vtrade/market`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('div').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') el.remove();
    });
    const main = document.querySelector('main');
    if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
    if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
  });
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'market.png'), fullPage: true });
  console.log('  ✓ market.png');

  // Market tabs
  const marketTabs = ['Equities', 'ETFs', 'Crypto', 'Forex', 'Commodities', 'Indices'];
  for (const tab of marketTabs) {
    console.log(`Capturing: market-${tab.toLowerCase()}.png...`);
    await page.goto(`${BASE_URL}/vtrade/market`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(4000);
    const tabBtn = page.locator(`button:has-text("${tab}")`).first();
    try {
      await tabBtn.click({ timeout: 5000 });
      await page.waitForTimeout(8000);
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      await page.evaluate(() => {
        document.querySelectorAll('[class*="BottomNav"], [class*="bottomNav"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('div').forEach(el => {
          const style = getComputedStyle(el);
          if (style.position === 'fixed' && Number(style.zIndex) >= 90 && el.getAttribute('role') !== 'navigation') el.remove();
        });
        const main = document.querySelector('main');
        if (main) { main.style.overflow = 'visible'; main.style.height = 'auto'; }
        if (main?.parentElement) { main.parentElement.style.overflow = 'visible'; main.parentElement.style.height = 'auto'; }
      });
      await page.screenshot({ path: resolve(OUTPUT_DIR, `market-${tab.toLowerCase()}.png`), fullPage: true });
      console.log(`  ✓ market-${tab.toLowerCase()}.png`);
    } catch {
      console.log(`  ⚠ Market tab "${tab}" not found, skipping`);
    }
  }

  // ═══════════════════════════════════════════════════
  // MISSIONS
  // ═══════════════════════════════════════════════════
  console.log('Capturing: missions.png...');
  await page.goto(`${BASE_URL}/vtrade/missions`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(4000);
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
  await page.screenshot({ path: resolve(OUTPUT_DIR, 'missions.png'), fullPage: true });
  console.log('  ✓ missions.png');

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
