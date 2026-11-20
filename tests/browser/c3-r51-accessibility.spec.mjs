import {test,expect} from '@playwright/test';
const pages=[
  {path:'/viewer-demo.html',open:'Verify and show synthetic triangle',close:'Close viewer',field:'#viewer-camera-controls',status:'#viewer-status',surface:'#viewer-surface',help:'#viewer-camera-help'},
  {path:'/indexed-demo.html',open:'Verify and render indexed cube',close:'Close indexed viewer',field:'#indexed-camera-controls',status:'#indexed-status',surface:'#indexed-surface',help:'#indexed-camera-help'}
];
for (const route of pages) {
  test('C3-R51 keyboard semantics and live-region behavior: '+route.path,async({page,browserName})=>{
    await page.goto(route.path);
    const group=page.locator(route.field), status=page.locator(route.status), start=page.getByRole('button',{name:route.open});
    await expect(group).toHaveAttribute('disabled','');
    await expect(status).toHaveAttribute('role','status');
    await expect(status).toHaveAttribute('aria-live','polite');
    await expect(group).toHaveAttribute('aria-describedby',new RegExp(route.help.slice(1)));
    await expect(page.locator(route.help)).toContainText(/Tab/);
    await expect(page.locator(route.surface)).toHaveAttribute('aria-describedby',route.help.slice(1));
    await expect(page.locator(route.surface+' canvas')).toHaveCount(0);
    // Disabled controls are skipped in keyboard focus order until verification.
    await start.focus();
    await page.keyboard.press('Tab');
    await expect(group.getByRole('button',{name:'Rotate left'})).not.toBeFocused();
    await start.click();
    await expect(status).toContainText(/rendered|unavailable/i);
    if(/unavailable/i.test(await status.innerText())){
      await expect(group).toHaveAttribute('disabled','');
      if(browserName==='firefox' && process.env.C3_R45_REQUIRE_FIREFOX_PIXELS!=='1')return;
      throw Error('Graphics required for accessible controls');
    }
    await expect(group).not.toHaveAttribute('disabled');
    await start.focus();
    await page.keyboard.press('Tab');
    // Close button precedes camera controls in document order.
    await expect(page.getByRole('button',{name:route.close})).toBeFocused();
    await page.keyboard.press('Tab');
    const left=group.getByRole('button',{name:'Rotate left'});
    await expect(left).toBeFocused();
    await page.keyboard.press('Space');
    await expect(status).toContainText(/View: horizontal/);
    const message=await status.innerText();
    expect(message).toMatch(/degrees, vertical .* degrees, distance/);
    const right=group.getByRole('button',{name:'Rotate right'});
    await page.keyboard.press('Tab');
    await expect(right).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(status).toContainText('View:');
    // Repeated activation remains bounded and the canvas stays unique.
    for(let i=0;i<28;i++) await right.click();
    await expect(status).toContainText('horizontal 180 degrees');
    const count=await status.evaluate(el=>{
      let writes=0;
      const observer=new MutationObserver(()=>writes++);
      observer.observe(el,{childList:true,characterData:true,subtree:true});
      el.__r51Observation={observer,get writes(){return writes;}};
      return writes;
    });
    expect(count).toBe(0);
    await right.click(); await right.click();
    const extraWrites=await status.evaluate(el=>{const n=el.__r51Observation.writes;el.__r51Observation.observer.disconnect();delete el.__r51Observation;return n;});
    expect(extraWrites,'camera bounds must not repeat identical polite announcements').toBe(0);
    await expect(page.locator(route.surface+' canvas')).toHaveCount(1);
    await page.getByRole('button',{name:route.close}).click();
    await expect(group).toHaveAttribute('disabled','');
    await expect(start).toBeFocused();
  });
  test('C3-R51 focus is recovered and controls fail closed after GPU loss: '+route.path,async({page,browserName})=>{
    await page.goto(route.path);
    const start=page.getByRole('button',{name:route.open});
    await start.click();
    const status=page.locator(route.status);
    await expect(status).toContainText(/rendered|unavailable/i);
    if(/unavailable/i.test(await status.innerText())){
      if(browserName==='firefox' && process.env.C3_R45_REQUIRE_FIREFOX_PIXELS!=='1')return;
      throw Error('Graphics required');
    }
    const left=page.locator(route.field).getByRole('button',{name:'Rotate left'});
    await left.focus();
    await page.locator(route.surface+' canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await expect(status).toContainText(/context lost/i);
    await expect(page.locator(route.field)).toHaveAttribute('disabled','');
    await expect(start).toBeFocused();
    await expect(page.locator(route.surface+' canvas')).toHaveCount(0);
  });
}
