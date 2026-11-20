import { test, expect } from '@playwright/test';

// Bounded synthetic-only benchmark. Chromium is the stable baseline; R45 retains
// a separate hard Firefox/Mesa rendering gate. Do not compare noisy GPU heap sizes.
test('C3-R47 startup, repeated cycles, resize and observable resource budget', async ({page,browserName})=>{
  test.skip(browserName !== 'chromium','Chromium CI baseline; other engines retain R43-R46 functional gates');
  test.setTimeout(90_000);
  await page.goto('/viewer-demo.html');
  const start=page.getByRole('button',{name:'Verify and show synthetic triangle'});
  const close=page.getByRole('button',{name:'Close viewer'});
  const surface=page.locator('#viewer-surface');
  const canvas=surface.locator('canvas');
  let assetRequests=0,engineRequests=0;
  page.on('request', req=>{
    const url=req.url();
    if (/demo-triangle-[^/]+\.glb/.test(url)) assetRequests++;
    if (/viewer-engine-[^/]+\.js/.test(url)) engineRequests++;
  });
  expect(assetRequests).toBe(0);
  expect(engineRequests).toBe(0);
  const cycles=[];
  const heap=[];
  for(let i=0;i<5;i++){
    const started=Date.now();
    await start.click();
    await expect(page.getByRole('status')).toContainText('Synthetic triangle rendered');
    await expect(canvas).toHaveCount(1);
    const elapsed=Date.now()-started;
    cycles.push(elapsed);
    expect(elapsed,'synthetic open '+i+' exceeded 12s').toBeLessThan(12_000);
    const observed=await page.evaluate(()=>({
      count:document.querySelectorAll('#viewer-surface canvas').length,
      heap:performance.memory?.usedJSHeapSize ?? null
    }));
    expect(observed.count).toBe(1);
    if(typeof observed.heap==='number') heap.push(observed.heap);
    if(i===0){
      const before=await canvas.evaluate(c=>({w:c.width,h:c.height}));
      const changed=Date.now();
      await surface.evaluate(element=>{element.style.width='360px';});
      await expect.poll(async()=>canvas.evaluate(c=>c.width),{timeout:3000}).toBeLessThan(before.w);
      expect(Date.now()-changed,'resize must settle within 3s').toBeLessThan(3000);
      await surface.evaluate(element=>{element.style.width='';});
    }
    await close.click();
    await expect(canvas).toHaveCount(0);
    await expect(start).toBeEnabled();
    await expect(close).toBeDisabled();
  }
  expect(assetRequests,'every session must fetch integrity-checked GLB').toBe(5);
  expect(engineRequests,'Three.js must load once, only after first verification').toBe(1);
  const ordered=[...cycles].sort((a,b)=>a-b);
  const report={
    environment:'chromium-software-ci', cycles,medianMs:ordered[2],
    maxMs:ordered.at(-1),glbFetches:assetRequests,engineImports:engineRequests,
    usedJSHeapBytes:heap.length===5?heap:null
  };
  console.log('C3-R47 PERFORMANCE '+JSON.stringify(report));
  expect(report.medianMs,'median warm/cold startup exceeded 6s').toBeLessThan(6000);
  // JS heap is diagnostic only: garbage collector timing and GPU allocations
  // differ across browsers and are NOT a reliable fixed leak budget.
});
