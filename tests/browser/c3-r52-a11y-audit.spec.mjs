import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes=[
  {path:'/viewer-demo.html',open:'Verify and show synthetic triangle',close:'Close viewer',fieldset:'#viewer-camera-controls',surface:'#viewer-surface'},
  {path:'/indexed-demo.html',open:'Verify and render indexed cube',close:'Close indexed viewer',fieldset:'#indexed-camera-controls',surface:'#indexed-surface'}
];
async function audit(page, state) {
  const result=await new AxeBuilder({page})
    .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])
    .analyze();
  const details=result.violations.map(v=>({
    id:v.id,impact:v.impact,description:v.description,
    targets:v.nodes.map(n=>n.target.join(' '))
  }));
  console.log('C3-R52 AXE '+JSON.stringify({state,violations:details}));
  expect(details,'WCAG A/AA automated findings at '+state).toEqual([]);
}
for(const route of routes){
  test('C3-R52 WCAG-oriented axe audit: '+route.path,async({page,browserName})=>{
    await page.goto(route.path);
    await audit(page,route.path+':initial');
    const start=page.getByRole('button',{name:route.open});
    await start.click();
    await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
    const failed=/unavailable/i.test(await page.getByRole('status').innerText());
    await audit(page,route.path+(failed?':fail-closed':':rendered'));
    if(failed){
      await expect(page.locator(route.fieldset)).toHaveAttribute('disabled','');
      if(browserName!=='firefox'||process.env.C3_R45_REQUIRE_FIREFOX_PIXELS==='1')throw Error('Unexpected graphics fallback');
      return;
    }
    await page.locator(route.fieldset).getByRole('button',{name:'Reset view'}).click();
    await audit(page,route.path+':active-controls');
    await page.getByRole('button',{name:route.close}).click();
    await expect(page.locator(route.fieldset)).toHaveAttribute('disabled','');
    await audit(page,route.path+':closed');
  });
  test('C3-R52 focus-visible, reduced motion and narrow viewport: '+route.path,async({page,browserName})=>{
    await page.setViewportSize({width:360,height:740});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(route.path);
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
    const start=page.getByRole('button',{name:route.open});
    await page.keyboard.press('Tab');
    await expect(start).toBeFocused();
    const focus=await start.evaluate(el=>{
      const style=getComputedStyle(el);
      return {outlineStyle:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
    });
    expect(focus.outlineStyle).not.toBe('none');
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText(/rendered|unavailable/i);
    const failed=/unavailable/i.test(await page.getByRole('status').innerText());
    if(failed){
      if(browserName!=='firefox'||process.env.C3_R45_REQUIRE_FIREFOX_PIXELS==='1')throw Error('Unexpected graphics fallback');
      return;
    }
    const right=page.locator(route.fieldset).getByRole('button',{name:'Rotate right'});
    await right.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status')).toContainText('View:');
    const motion=await page.evaluate(()=>{
      const button=document.querySelector('button:focus');
      const s=getComputedStyle(button);
      return {animation:s.animationDuration,transition:s.transitionDuration,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    expect(motion.animation).toMatch(/^(0s|0ms)/);
    expect(motion.transition).toMatch(/^(0s|0ms)/);
    expect(motion.scrollWidth,'unexpected horizontal overflow at 360px').toBeLessThanOrEqual(motion.viewport);
    await page.getByRole('button',{name:route.close}).click();
    await expect(start).toBeFocused();
  });
}
