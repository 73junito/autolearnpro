import { test, expect } from '@playwright/test';

test('Firefox WebGL capability evidence, no production claims', async ({ page, browserName }) => {
  const consoles = [];
  page.on('console', event => { if(event.type()==='error'||event.type()==='warning') consoles.push(event.text()); });
  page.on('pageerror', e => consoles.push('pageerror: '+e.message));
  await page.goto('/viewer-demo.html');
  const probe = await page.evaluate(() => {
    const canvas=document.createElement('canvas');
    const gl2=canvas.getContext('webgl2',{preserveDrawingBuffer:true});
    const gl=gl2 ?? canvas.getContext('webgl',{preserveDrawingBuffer:true});
    if(!gl) return {webgl:false,webgl2:false,reason:'WebGL context unavailable'};
    return {
      webgl:true,
      webgl2:Boolean(gl2),
      renderer:String(gl.getParameter(gl.RENDERER)),
      vendor:String(gl.getParameter(gl.VENDOR))
    };
  });
  await page.getByRole('button',{name:'Verify and show synthetic triangle'}).click();
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  const status=await page.getByRole('status').innerText();
  console.log('C3-R44 WEBGL DIAGNOSTIC '+JSON.stringify({browserName,probe,status,consoles:consoles.slice(0,12)}));
  if(/rendered/.test(status)) {
    const canvas=page.locator('#viewer-surface canvas');
    await expect(canvas).toHaveCount(1);
  } else {
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  }
});
