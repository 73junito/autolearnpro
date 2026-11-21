import {test,expect} from '@playwright/test';

// C3-R72: browser-only keyboard/focus/recovery assertions. Never claims NVDA speech.
const routes=[
  {path:'/viewer-demo.html',open:'Verify and show synthetic triangle',close:'Close viewer',
    group:'#viewer-camera-controls',status:'#viewer-status',surface:'#viewer-surface'},
  {path:'/indexed-demo.html',open:'Verify and render indexed cube',close:'Close indexed viewer',
    group:'#indexed-camera-controls',status:'#indexed-status',surface:'#indexed-surface'}
];
async function requireRendered(page,browserName,route){
  const status=page.locator(route.status);
  await expect(status).toContainText(/rendered|unavailable/i);
  if(/unavailable/i.test(await status.innerText())){
    // Matches existing R51 policy: Firefox GPU-dependent rendering is mandatory in strict Linux CI.
    if(browserName==='firefox'&&process.env.C3_R45_REQUIRE_FIREFOX_PIXELS!=='1')return false;
    throw Error('WebGL rendering required for R72 keyboard recovery: '+route.path);
  }
  return true;
}
for(const route of routes){
  test('C3-R72 close, tab-order recovery, Space reopen: '+route.path,async({page,browserName})=>{
    await page.goto(route.path);
    const open=page.getByRole('button',{name:route.open,exact:true});
    const close=page.getByRole('button',{name:route.close,exact:true});
    const group=page.locator(route.group);
    const status=page.locator(route.status);
    const canvas=page.locator(route.surface+' canvas');
    await expect(open).toBeEnabled();
    await expect(close).toBeDisabled();
    await expect(group).toHaveAttribute('disabled','');
    await open.focus();
    await page.keyboard.press('Space');
    if(!await requireRendered(page,browserName,route))return;
    await expect(open).toBeDisabled();
    await expect(close).toBeEnabled();
    await expect(group).not.toHaveAttribute('disabled','');
    await expect(canvas).toHaveCount(1);
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(status).toContainText(/closed/i);
    await expect(open).toBeEnabled();
    await expect(open).toBeFocused();
    await expect(close).toBeDisabled();
    await expect(group).toHaveAttribute('disabled','');
    await expect(canvas).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(close).not.toBeFocused();
    await expect(group.getByRole('button',{name:'Rotate left'})).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await page.keyboard.press('Space');
    if(!await requireRendered(page,browserName,route))return;
    await expect(canvas).toHaveCount(1);
    await expect(group).not.toHaveAttribute('disabled','');
    await expect(close).toBeEnabled();
    await expect(status).toContainText(/rendered/i);
    await close.click();
    await expect(open).toBeFocused();
    await expect(canvas).toHaveCount(0);
  });

  test('C3-R72 asset failure disables controls, then keyboard retry: '+route.path,async({page,browserName})=>{
    let shouldFail=true;
    await page.route('**/*.glb',async r=>{
      if(shouldFail)await r.abort('failed');
      else await r.continue();
    });
    await page.goto(route.path);
    const open=page.getByRole('button',{name:route.open,exact:true});
    const close=page.getByRole('button',{name:route.close,exact:true});
    const group=page.locator(route.group);
    const canvas=page.locator(route.surface+' canvas');
    const status=page.locator(route.status);
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(status).toContainText(/unavailable/i);
    await expect(group).toHaveAttribute('disabled','');
    await expect(close).toBeDisabled();
    await expect(open).toBeEnabled();
    await expect(canvas).toHaveCount(0);
    shouldFail=false;
    await open.focus();
    await page.keyboard.press('Space');
    if(!await requireRendered(page,browserName,route))return;
    await expect(canvas).toHaveCount(1);
    await expect(group).not.toHaveAttribute('disabled','');
    await close.click();
    await expect(canvas).toHaveCount(0);
    await expect(open).toBeFocused();
  });
}
