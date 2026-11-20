import test from 'node:test';
import assert from 'node:assert/strict';
import {loadManifest,assembleEvidence,validateEvidence} from '../infrastructure/scripts/c3-r53-accessibility-evidence.mjs';
const manifest=loadManifest();
const titles=manifest.mandatoryAutomated;
const pages=manifest.surfaces;
const mkSpec=(item,surface,browser,strict)=>{
  const states=strict?['initial','rendered','active-controls','closed']:browser==='firefox'?['initial','fail-closed']:['initial','rendered','active-controls','closed'];
  const stdout=item.id==='axe-wcag-a-aa'?states.map(state=>({text:'C3-R52 AXE '+JSON.stringify({state:surface+':'+state,violations:[]})+'\n'})):[];
  return {title:item.title+' '+surface,tests:[{projectName:browser,status:'expected',results:[{status:'passed',errors:[],stdout}]}]};
};
const create=(strict=false)=>({
  suites:titles.filter(item=>!strict||item.requiredStrictFirefox).map(item=>({
    file:item.source,
    specs:pages.map(surface=>({
      title:item.title+' '+surface,
      tests:(strict?['firefox']:manifest.requiredBrowsers).map(browser=>mkSpec(item,surface,browser,strict).tests[0])
    }))
  })),
  errors:[],stats:{unexpected:0,flaky:0}
});
test('C3-R53 manifest always holds publication and all manual signoff',()=>{
  assert.equal(manifest.releaseStatus,'HOLD');
  assert.ok(manifest.manualAcceptance.every(x=>x.status==='NOT_TESTED'));
});
test('full browser run assembles deterministic traceable evidence without certification',()=>{
  const normal=create(),strict=create(true);
  const a=assembleEvidence(manifest,normal,strict);
  const b=assembleEvidence(manifest,normal,strict);
  assert.deepEqual(a,b);
  assert.equal(a.automatedChecks.length,36);
  assert.ok(a.automatedChecks.every(x=>x.outcome==='passed'));
  assert.equal(a.releaseStatus,'HOLD');
  assert.equal(a.certification,'NOT_CERTIFIED');
  assert.equal(a.manualStatus,'NOT_TESTED');
  assert.equal(validateEvidence(a,manifest),true);
});
test('missing engine or required strict Firefox test rejects evidence',()=>{
  const normal=create();
  normal.suites[0].specs[0].tests=normal.suites[0].specs[0].tests.filter(x=>x.projectName!=='webkit');
  assert.throws(()=>assembleEvidence(manifest,normal,create(true)),/required browser missing/);
  const strict=create(true);
  strict.suites.shift();
  assert.throws(()=>assembleEvidence(manifest,create(),strict),/required spec missing/);
});
test('automated axe violations, missing rendered states, and skipped tests reject evidence',()=>{
  const normal=create();
  normal.suites[0].specs[0].tests[0].results[0].stdout[1].text='C3-R52 AXE '+JSON.stringify({state:'/viewer-demo.html:rendered',violations:[{id:'color-contrast'}]})+'\n';
  assert.throws(()=>assembleEvidence(manifest,normal,create(true)),/axe violation/);
  const noState=create(true);
  noState.suites[0].specs[0].tests[0].results[0].stdout.pop();
  assert.throws(()=>assembleEvidence(manifest,create(),noState),/missing\/duplicate/);
  const skipped=create();
  skipped.suites[0].specs[0].tests[0].status='skipped';
  assert.throws(()=>assembleEvidence(manifest,skipped,create(true)),/failed or skipped/);
});
test('forged manual release, tampered source hashes, and absent coverage are denied',()=>{
  const good=assembleEvidence(manifest,create(),create(true));
  assert.throws(()=>validateEvidence({...good,certification:'WCAG-certified'},manifest),/release claims/);
  assert.throws(()=>validateEvidence({...good,manualAcceptance:[{id:'nvda',status:'PASS'}]},manifest),/manual status/);
  assert.throws(()=>validateEvidence({...good,testSourcesSha256:{}},manifest),/test source hash/);
  assert.throws(()=>validateEvidence({...good,automatedChecks:good.automatedChecks.slice(1)},manifest),/missing evidence/);
});
