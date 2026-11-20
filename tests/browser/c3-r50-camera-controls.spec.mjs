import {test,expect} from '@playwright/test';
const routes=[
  {url:'/viewer-demo.html',open:'Verify and show synthetic triangle',close:'Close viewer',field:'#viewer-camera-controls',surface:'#viewer-surface'},
  {url:'/indexed-demo.html',open:'Verify and render indexed cube',close:'Close indexed viewer',field:'#indexed-camera-controls',surface:'#indexed-surface'}
];
for(const route of routes){
  test('C3-R50 accessible bounded controls: '+route.url,async({page,browserName})=>{
    await page.goto(route.url);
    const group=page.locator(route.field);
    await expect(group).toHaveAttribute('disabled','');
    await expect(group.locator('button')).toHaveCount(7);
    await expect(page.locator(route.surface+' canvas')).toHaveCount(0);
    await page.getByRole('button',{name:route.open}).click();
    await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
    if(/unavailable/i.test(await page.getByRole('status').innerText())){
      await expect(group).toHaveAttribute('disabled','');
      if(browserName==='firefox' && process.env.C3_R45_REQUIRE_FIREFOX_PIXELS!=='1')return;
      throw Error('WebGL required for bounded keyboard-control acceptance');
    }
    await expect(group).not.toHaveAttribute('disabled');
    await expect(group.getByRole('button',{name:'Rotate left'})).toBeEnabled();
    const canvas=page.locator(route.surface+' canvas');
    await expect(canvas).toHaveCount(1);
    const beforePixels=await canvas.screenshot();
    const control=async(name)=>{const button=group.getByRole('button',{name,exact:true});await button.focus();await page.keyboard.press('Enter');await expect(page.getByRole('status')).toContainText('View:');};
    await control('Rotate right');
    const rotatedPixels=await canvas.screenshot();
    expect(rotatedPixels.equals(beforePixels),'camera rotation must change actual rendered pixels').toBe(false);
    await expect(page.getByRole('status')).toContainText('horizontal');
    await control('Tilt up');
    await control('Zoom in');
    for(let i=0;i<20;i++)await group.getByRole('button',{name:'Zoom in'}).click();
    await expect(page.getByRole('status')).toContainText('distance 2.');
    for(let i=0;i<20;i++)await group.getByRole('button',{name:'Tilt up'}).click();
    await expect(page.getByRole('status')).toContainText('vertical 60 degrees');
    await control('Reset view');
    await expect(page.getByRole('status')).toContainText(route.url.includes('indexed')?'distance 5.':'distance 3.');
    await expect(canvas).toHaveCount(1);
    await page.getByRole('button',{name:route.close}).click();
    await expect(group).toHaveAttribute('disabled','');
    await expect(canvas).toHaveCount(0);
    await expect(page.getByRole('button',{name:route.open})).toBeFocused();
  });
  test('C3-R50 controls fail closed on context loss: '+route.url,async({page,browserName})=>{
    await page.goto(route.url);
    await page.getByRole('button',{name:route.open}).click();
    await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
    if(/unavailable/i.test(await page.getByRole('status').innerText())){
      if(browserName==='firefox' && process.env.C3_R45_REQUIRE_FIREFOX_PIXELS!=='1')return;
      throw Error('WebGL required');
    }
    await page.locator(route.surface+' canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await expect(route.url.includes('indexed')?page.getByRole('status'):page.getByRole('status')).toContainText(/context lost/i);
    await expect(page.locator(route.field)).toHaveAttribute('disabled','');
    await expect(page.locator(route.surface+' canvas')).toHaveCount(0);
  });
}
