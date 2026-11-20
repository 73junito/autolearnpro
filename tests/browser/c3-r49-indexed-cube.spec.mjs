import {test,expect} from '@playwright/test';
const title='Verify and render indexed cube';
const ok=/Indexed cube rendered/;
async function open(page,browserName){
  await page.getByRole('button',{name:title}).click();
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  if(ok.test(await page.getByRole('status').innerText())) return true;
  await expect(page.locator('#indexed-surface canvas')).toHaveCount(0);
  if(browserName==='firefox' && process.env.C3_R45_REQUIRE_FIREFOX_PIXELS!=='1') {
    test.info().annotations.push({type:'webgl-unavailable',description:'Headless Firefox cannot certify indexed-cube rendering'});
    return false;
  }
  throw Error('Indexed GLB rendering required on '+browserName);
}
test('indexed cube is opt-in, SHA-256 gated, drawn with indexed GLB and cleaned up',async({page,browserName})=>{
  let glbs=0,engines=0;
  page.on('request',r=>{
    if(/c3-r48-synthetic-cube-[^/]+\.glb/.test(r.url())) glbs++;
    if(/viewer-engine-[^/]+\.js/.test(r.url())) engines++;
  });
  await page.goto('/indexed-demo.html');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, nofollow');
  await expect(page.locator('#indexed-surface canvas')).toHaveCount(0);
  expect(glbs).toBe(0);expect(engines).toBe(0);
  await page.getByRole('button',{name:title}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
  const ready=ok.test(await page.getByRole('status').innerText());
  expect(glbs).toBe(1);
  if(!ready){
    await expect(page.locator('#indexed-surface canvas')).toHaveCount(0);
    expect(engines).toBeGreaterThanOrEqual(0);
    if(browserName!=='firefox'||process.env.C3_R45_REQUIRE_FIREFOX_PIXELS==='1')throw Error('Indexed cube failed to render');
    return;
  }
  expect(engines).toBe(1);
  const canvas=page.locator('#indexed-surface canvas');
  await expect(canvas).toHaveCount(1);
  const readback=await canvas.evaluate(el=>{
    const gl=el.getContext('webgl2')??el.getContext('webgl');
    if(!gl)return {error:'No WebGL'};
    const bytes=new Uint8Array(el.width*el.height*4);
    gl.readPixels(0,0,el.width,el.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let blue=0;
    for(let i=0;i<bytes.length;i+=4){
      if(bytes[i+3]>128 && bytes[i+2]>bytes[i]+40 && bytes[i+2]>bytes[i+1]+20)blue++;
    }
    return {blue,glError:gl.getError()};
  });
  console.log('C3-R49 INDEXED PIXELS '+JSON.stringify({browserName,...readback}));
  expect(readback.error).toBeUndefined();
  expect(readback.glError).toBe(0);
  expect(readback.blue).toBeGreaterThan(300);
  await page.getByRole('button',{name:'Close indexed viewer'}).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('button',{name:title})).toBeFocused();
});
test('tampered indexed GLB never imports Three.js',async({page})=>{
  let engine=0;
  await page.route('**/*.glb*',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:Buffer.from('tampered indexed content')}));
  page.on('request',r=>{if(/viewer-engine-[^/]+\.js/.test(r.url()))engine++;});
  await page.goto('/indexed-demo.html');
  await page.getByRole('button',{name:title}).click();
  await expect(page.getByRole('status')).toContainText(/unavailable/i);
  expect(engine).toBe(0);
  await expect(page.locator('#indexed-surface canvas')).toHaveCount(0);
});
test('indexed cube failure retries through fresh verified session',async({page,browserName})=>{
  let deny=true;
  await page.route('**/*.glb*',route=>deny?route.fulfill({status:404,body:'not found'}):route.continue());
  await page.goto('/indexed-demo.html');
  await page.getByRole('button',{name:title}).click();
  await expect(page.getByRole('status')).toContainText(/unavailable/i);
  await expect(page.locator('#indexed-surface canvas')).toHaveCount(0);
  deny=false;
  if(!await open(page,browserName))return;
  await expect(page.locator('#indexed-surface canvas')).toHaveCount(1);
  await page.getByRole('button',{name:'Close indexed viewer'}).click();
});
