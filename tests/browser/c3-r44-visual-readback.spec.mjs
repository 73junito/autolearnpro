import { test, expect } from '@playwright/test';

test('actual rendered triangle changes framebuffer pixels; fallback is recorded, never called a render', async ({ page, browserName }) => {
  await page.goto('/viewer-demo.html');
  await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
  await page.getByRole('button', {name:'Verify and show synthetic triangle'}).click();
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  const status = await page.getByRole('status').innerText();
  if (!/rendered/.test(status)) {
    const probe = await page.evaluate(() => {
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      return {webglAvailable:Boolean(ctx),version:ctx?.getParameter(ctx.VERSION) ?? null};
    });
    console.log('C3-R44 VISUAL '+JSON.stringify({browserName,outcome:'FAIL_CLOSED_NO_RENDER',probe}));
    await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
    if(browserName !== 'firefox' || process.env.C3_R45_REQUIRE_FIREFOX_PIXELS === '1') {
      throw Error('Rendered framebuffer required for ' + browserName + ' (C3-R45 strict pixel gate)');
    }
    test.info().annotations.push({type:'visual-not-certified',description:'Firefox fallback: no actual rendered pixels'});
    return;
  }
  const pixels=await page.locator('#viewer-surface canvas').evaluate(canvas => {
    const gl=canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if(!gl) return {error:'No WebGL context on existing canvas'};
    const width=canvas.width, height=canvas.height;
    const bytes=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const glError=gl.getError();
    let blue=0, opaque=0, center=0;
    const minX=Math.floor(width*0.15),maxX=Math.ceil(width*0.85);
    const minY=Math.floor(height*0.15),maxY=Math.ceil(height*0.85);
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++) {
      const i=(y*width+x)*4;
      const r=bytes[i],g=bytes[i+1],b=bytes[i+2],a=bytes[i+3];
      if(a>128) opaque++;
      if(a>128 && b>r+40 && b>g+20) blue++;
      if(x>width*0.35 && x<width*0.65 && y>height*0.35 && y<height*0.65 && a>128 && b>r+40) center++;
    }
    return {width,height,glError,blue,opaque,center};
  });
  console.log('C3-R44 VISUAL '+JSON.stringify({browserName,outcome:'PIXEL_READBACK',pixels}));
  expect(pixels.error).toBeUndefined();
  expect(pixels.glError).toBe(0);
  expect(pixels.blue).toBeGreaterThan(200);
  expect(pixels.opaque).toBeGreaterThan(200);
  expect(pixels.center).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Close viewer'}).click();
  await expect(page.locator('#viewer-surface canvas')).toHaveCount(0);
});
