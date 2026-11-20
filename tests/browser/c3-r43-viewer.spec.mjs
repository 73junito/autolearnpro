import { test, expect } from '@playwright/test';

const pagePath = '/viewer-demo.html';
const readyText = /Synthetic triangle rendered/;
const failedText = /Viewer unavailable/;
const glbRequest = /demo-triangle.*\.glb(?:\?|$)/;
const engineRequest = /viewer-engine-[^/]+\.js/;

test('keyboard start/close, genuine GLB render or explicit WebGL fallback, and cleanup', async ({ page, browserName }) => {
  const javascriptErrors = [];
  page.on('pageerror', error => javascriptErrors.push(error.message));
  const requested = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto(pagePath);
  await expect(page.getByRole('heading', { name: /Synthetic triangle/ })).toBeVisible();
  const start = page.getByRole('button', { name: 'Verify and show synthetic triangle' });
  const close = page.getByRole('button', { name: 'Close viewer' });
  await expect(start).toBeEnabled();
  await expect(close).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Viewer not started');
  await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  expect(requested.some(url => glbRequest.test(url))).toBeFalsy();
  expect(requested.some(url => engineRequest.test(url))).toBeFalsy();

  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  const text = await page.getByRole('status').innerText();
  console.log('C3-R43 render outcome (' + browserName + '): ' + (readyText.test(text) ? 'WEBGL_RENDERED' : 'FAIL_CLOSED_FALLBACK'));
  if (browserName === 'chromium') expect(text).toMatch(readyText);
  expect(requested.some(url => glbRequest.test(url))).toBeTruthy();

  if (readyText.test(text)) {
    await expect(close).toBeEnabled();
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(1);
    expect(requested.some(url => engineRequest.test(url))).toBeTruthy();
    const canvas = page.locator('#viewer-surface canvas');
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas).toHaveAttribute('tabindex', '-1');
    const screenshot = await canvas.screenshot();
    expect(screenshot.length).toBeGreaterThan(500);
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Viewer closed');
    await expect(start).toBeFocused();
    await expect(close).toBeDisabled();
  } else {
    // Linux software WebGL can legitimately be unavailable on some runner/browser builds.
    // This MUST report a clean fail-closed state, not an unverified canvas or a false pass as rendered.
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
    await expect(start).toBeEnabled();
    await expect(close).toBeDisabled();
    test.info().annotations.push({
      type: 'webgl-unavailable',
      description: browserName + ' showed explicit fail-closed fallback; rendering not certified'
    });
  }
  expect(javascriptErrors).toEqual([]);
});

test('tampered GLB is blocked before Three.js dynamic import', async ({ page }) => {
  const requested = [];
  await page.route('**/*.glb*', route => route.fulfill({
    status: 200, contentType: 'model/gltf-binary', body: Buffer.from('bad-untrusted-asset')
  }));
  page.on('request', request => requested.push(request.url()));
  await page.goto(pagePath);
  await page.getByRole('button', { name: 'Verify and show synthetic triangle' }).click();
  await expect(page.getByRole('status')).toContainText(failedText);
  expect(requested.some(url => engineRequest.test(url))).toBeFalsy();
  await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verify and show synthetic triangle' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Close viewer' })).toBeDisabled();
});

test('missing asset displays error and permits explicit retry without false ready state', async ({ page }) => {
  let block = true;
  await page.route('**/*.glb*', route => block
    ? route.fulfill({status:404,body:'missing'})
    : route.continue());
  await page.goto(pagePath);
  const start = page.getByRole('button', { name: 'Verify and show synthetic triangle' });
  await start.click();
  await expect(page.getByRole('status')).toContainText(failedText);
  await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  block = false;
  await start.click();
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  if (readyText.test(await page.getByRole('status').innerText())) {
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(1);
  } else {
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  }
});

test('status, visual focus, no auto-start and reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(pagePath);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  const start = page.getByRole('button', { name: 'Verify and show synthetic triangle' });
  await start.focus();
  const focusOutline = await start.evaluate(element => getComputedStyle(element).outlineStyle);
  expect(focusOutline).not.toBe('none');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBeTruthy();
});
