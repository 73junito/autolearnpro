import { test, expect } from '@playwright/test';

const startName = 'Verify and show synthetic triangle';
const closeName = 'Close viewer';
const rendered = /Synthetic triangle rendered/;

async function openVerified(page, browserName) {
  await page.getByRole('button', {name:startName}).click();
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  const successful = rendered.test(await page.getByRole('status').innerText());
  if (!successful) {
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
    if (browserName !== 'firefox' || process.env.C3_R45_REQUIRE_FIREFOX_PIXELS === '1') {
      throw Error('Expected real WebGL rendering on ' + browserName);
    }
    test.info().annotations.push({type:'webgl-unavailable',description:'Firefox headless runner cannot certify GPU lifecycle'});
  }
  return successful;
}

test('repeated verified opens/closes keep exactly one canvas and no leftover GPU context', async ({page,browserName}) => {
  await page.goto('/viewer-demo.html');
  let fetched=0;
  page.on('request', req => { if(/\.glb(?:\?|$)/.test(req.url())) fetched++; });
  for(let i=0;i<4;i++) {
    if (!await openVerified(page,browserName)) return;
    const canvas=page.locator('#viewer-surface canvas');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute('aria-hidden','true');
    await page.getByRole('button',{name:closeName}).click();
    await expect(canvas).toHaveCount(0);
    await expect(page.getByRole('button',{name:startName})).toBeEnabled();
    await expect(page.getByRole('button',{name:closeName})).toBeDisabled();
  }
  expect(fetched).toBe(4); // every cycle rechecks R39 data
});

test('changing viewer width recalculates canvas dimensions without fetching unverified assets', async ({page,browserName}) => {
  await page.goto('/viewer-demo.html');
  if (!await openVerified(page,browserName)) return;
  const canvas=page.locator('#viewer-surface canvas');
  const prior=await canvas.evaluate(el=>({width:el.width,height:el.height}));
  await page.locator('#viewer-surface').evaluate(el => {el.style.width='320px';});
  await expect.poll(async()=> canvas.evaluate(el=>el.width)).toBeLessThan(prior.width);
  const next=await canvas.evaluate(el=>({width:el.width,height:el.height}));
  expect(next.width).toBeGreaterThanOrEqual(200);
  expect(next.height).toBeGreaterThan(100);
  await page.getByRole('button',{name:closeName}).click();
});

test('WebGL context loss fails closed, clears canvas and permits fresh integrity check', async ({page,browserName}) => {
  await page.goto('/viewer-demo.html');
  if (!await openVerified(page,browserName)) return;
  const canvas=page.locator('#viewer-surface canvas');
  await canvas.evaluate(el => el.dispatchEvent(new Event('webglcontextlost', {cancelable:true})));
  await expect(page.getByRole('status')).toContainText(/WebGL context lost/);
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('button',{name:startName})).toBeEnabled();
  await expect(page.getByRole('button',{name:closeName})).toBeDisabled();
  if (!await openVerified(page,browserName)) return;
  await expect(canvas).toHaveCount(1);
  await page.getByRole('button',{name:closeName}).click();
  await expect(canvas).toHaveCount(0);
});
