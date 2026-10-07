// Visuel kontrol: tager skærmbilleder af laptop- og tv-visning.
// Brug: npm run build && npm start (i et andet vindue) && npm run screenshots
// Kræver en Chromium; sæt CHROMIUM_PATH hvis den ikke findes automatisk.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.DASHBOARD_URL ?? 'http://localhost:8080';
const ud = process.env.OUT_DIR ?? 'screenshots';
const executablePath = process.env.CHROMIUM_PATH;

const visninger = [
  { navn: 'laptop-1440', url: '/', width: 1440, height: 900, scale: 1 },
  { navn: 'laptop-mork-1440', url: '/', width: 1440, height: 900, scale: 1, moerk: true },
  { navn: 'mobil-390', url: '/', width: 390, height: 844, scale: 2, fuld: true },
  { navn: 'tv-1080p', url: '/?mode=tv&rotation=0&periode=uge', width: 1920, height: 1080, scale: 1 },
  { navn: 'tv-4k', url: '/?mode=tv&rotation=0&periode=maaned', width: 1920, height: 1080, scale: 2 },
];

await mkdir(ud, { recursive: true });
const browser = await chromium.launch({ executablePath });
for (const v of visninger) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.scale,
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    colorScheme: v.moerk ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  const fejl = [];
  page.on('pageerror', (e) => fejl.push(e.message));
  page.on('console', (m) => m.type() === 'error' && fejl.push(m.text()));
  await page.goto(base + v.url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.kort-vaerdi');
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > innerWidth,
    y: document.documentElement.scrollHeight > innerHeight,
  }));
  await page.screenshot({ path: `${ud}/${v.navn}.png`, fullPage: !!v.fuld });
  console.log(v.navn, { overflow, fejl });
  await ctx.close();
}
await browser.close();
