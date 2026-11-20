// C3-R53 source-only, fail-closed accessibility evidence gate.
// Deterministic: no network requests, wall clock, credentials or release actions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const manifestPath=path.join(root,'docs/c3-r53/accessibility-evidence-manifest.json');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const assert=(condition,message)=>{if(!condition)throw Error('C3-R53 evidence denied: '+message);};
const validFile=(rel)=>{
  assert(typeof rel==='string' && /^(tests\/browser\/)[a-z0-9-]+\.spec\.mjs$/.test(rel),'unsafe test reference');
  const abs=path.join(root,rel);
  assert(!fs.lstatSync(abs).isSymbolicLink(),'symlink evidence source');
  return abs;
};
export function loadManifest() {
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert(manifest.schemaVersion===1 && manifest.milestone==='C3-R53','unexpected manifest');
  assert(manifest.scope==='development-only-synthetic-viewers','scope widened');
  assert(manifest.releaseStatus==='HOLD','release hold removed');
  assert(JSON.stringify(manifest.surfaces)===JSON.stringify(['/viewer-demo.html','/indexed-demo.html']),'surface list changed');
  assert(JSON.stringify(manifest.requiredBrowsers)===JSON.stringify(['chromium','firefox','webkit']),'browser coverage changed');
  assert(Array.isArray(manifest.mandatoryAutomated) && manifest.mandatoryAutomated.length>=5,'mandatory tests missing');
  assert(Array.isArray(manifest.manualAcceptance) && manifest.manualAcceptance.length>=6,'manual gates missing');
  const seenIds=new Set();
  for(const item of manifest.mandatoryAutomated) {
    assert(typeof item.id==='string' && !seenIds.has(item.id),'missing/duplicate test ID');
    seenIds.add(item.id);
    const code=fs.readFileSync(validFile(item.source),'utf8');
    assert(code.includes(item.title),'listed test does not exist: '+item.title);
    assert(item.requiredStandard===true,'standard test bypass');
    assert(typeof item.requiredStrictFirefox==='boolean','missing strict Firefox policy');
  }
  for(const manual of manifest.manualAcceptance) {
    assert(typeof manual.id==='string' && !seenIds.has(manual.id),'duplicate manual ID');
    seenIds.add(manual.id);
    assert(manual.status==='NOT_TESTED','manual acceptance must remain unverified');
  }
  return manifest;
}
function specs(report) {
  const out=[];
  const walk=suites=>{
    for(const suite of suites??[]) {
      for(const spec of suite.specs??[])out.push(spec);
      walk(suite.suites);
    }
  };
  walk(report.suites);
  return out;
}
function checkRun(report,label){
  assert(report && typeof report==='object' && Array.isArray(report.suites),'invalid '+label+' Playwright JSON');
  assert(Array.isArray(report.errors) && report.errors.length===0,'runner-level errors in '+label);
  assert(report.stats?.unexpected===0 && report.stats?.flaky===0,'failures/flaky tests in '+label);
  return specs(report);
}
function testEntry(all,project,title){
  const items=all.filter(spec=>spec.title===title);
  assert(items.length===1,'required spec missing/duplicated: '+project+' '+title);
  const tests=items[0].tests.filter(t=>t.projectName===project);
  assert(tests.length===1,'required browser missing: '+project+' '+title);
  const test=tests[0];
  assert(test.status==='expected' && test.results?.length===1 && test.results[0].status==='passed' && test.results[0].errors.length===0,'required test failed or skipped: '+project+' '+title);
  return test;
}
function auditEvents(test,surface,strict){
  const lines=(test.results[0].stdout??[]).map(x=>x.text??'').join('').split(/\r?\n/);
  const events=lines.filter(line=>line.startsWith('C3-R52 AXE ')).map(line=>{
    let value;
    try {value=JSON.parse(line.slice('C3-R52 AXE '.length));}
    catch {assert(false,'invalid axe JSON output');}
    assert(Array.isArray(value.violations)&&value.violations.length===0,'axe violation or missing findings data');
    return value.state;
  });
  const required=[surface+':initial'];
  if(strict)required.push(surface+':rendered',surface+':active-controls',surface+':closed');
  else {
    const end=events.includes(surface+':fail-closed')?['fail-closed']:['rendered','active-controls','closed'];
    required.push(...end.map(s=>surface+':'+s));
  }
  assert(JSON.stringify(events)===JSON.stringify(required),'missing/duplicate/unexpected axe states: '+surface+' '+events.join(','));
  return events;
}
export function assembleEvidence(manifest,standard,strict,{commit='local-test'}={}) {
  assert(/^(local-test|[0-9a-f]{40})$/.test(commit),'invalid commit ID');
  const normal=checkRun(standard,'standard'), controlled=checkRun(strict,'strict Firefox');
  const results=[];
  const testSha=Object.fromEntries([...new Set(manifest.mandatoryAutomated.map(x=>x.source))].sort().map(source=>[source,sha(fs.readFileSync(validFile(source)))]));
  const check=(all,project,mode,item,surface)=>{
    const title=item.title+' '+surface;
    const test=testEntry(all,project,title);
    const entry={id:item.id,surface,browser:project,mode,outcome:'passed'};
    if(item.id==='axe-wcag-a-aa')entry.states=auditEvents(test,surface,mode==='mesa-xvfb');
    results.push(entry);
  };
  for(const item of manifest.mandatoryAutomated) {
    for(const surface of manifest.surfaces) {
      for(const browser of manifest.requiredBrowsers)check(normal,browser,'standard',item,surface);
      if(item.requiredStrictFirefox)check(controlled,'firefox','mesa-xvfb',item,surface);
    }
  }
  return {
    schemaVersion:1,milestone:'C3-R53',commit,releaseStatus:'HOLD',
    certification:'NOT_CERTIFIED',manualStatus:'NOT_TESTED',
    manifestSha256:sha(fs.readFileSync(manifestPath)),testSourcesSha256:testSha,
    automatedChecks:results,
    manualAcceptance:manifest.manualAcceptance.map(m=>({id:m.id,status:'NOT_TESTED'})),
    restrictions:'No production publication, Cloudflare deployment, DNS or hosted Supabase changes. No real vehicle models.'
  };
}
export function validateEvidence(report,manifest){
  assert(report?.schemaVersion===1&&report.milestone==='C3-R53','invalid evidence schema');
  assert(report.releaseStatus==='HOLD' && report.certification==='NOT_CERTIFIED' && report.manualStatus==='NOT_TESTED','release claims changed');
  assert(report.manifestSha256===sha(fs.readFileSync(manifestPath)),'manifest evidence stale');
  assert(JSON.stringify(report.manualAcceptance)===JSON.stringify(manifest.manualAcceptance),'manual status changed');
  const sources=Object.fromEntries([...new Set(manifest.mandatoryAutomated.map(x=>x.source))].sort().map(p=>[p,sha(fs.readFileSync(validFile(p)))]));
  assert(JSON.stringify(report.testSourcesSha256)===JSON.stringify(sources),'test source hash mismatch');
  const planned=manifest.mandatoryAutomated.reduce((n,item)=>n+2*(manifest.requiredBrowsers.length+(item.requiredStrictFirefox?1:0)),0);
  assert(report.automatedChecks?.length===planned,'missing evidence coverage');
  const expected=new Set();
  for(const test of manifest.mandatoryAutomated)for(const surface of manifest.surfaces){
    for(const browser of manifest.requiredBrowsers)expected.add([test.id,surface,browser,'standard'].join('|'));
    if(test.requiredStrictFirefox)expected.add([test.id,surface,'firefox','mesa-xvfb'].join('|'));
  }
  const seen=new Set();
  for(const result of report.automatedChecks){
    const key=[result.id,result.surface,result.browser,result.mode].join('|');
    assert(expected.has(key) && !seen.has(key),'unexpected, missing or duplicated browser evidence');
    seen.add(key);
    assert(result.outcome==='passed' && manifest.requiredBrowsers.includes(result.browser),'unverified check');
    assert(manifest.surfaces.includes(result.surface),'unauthorized surface');
    if(result.mode==='mesa-xvfb')assert(result.browser==='firefox','Mesa mode falsified');
    if(result.id==='axe-wcag-a-aa'){
      const prefix=result.surface+':';
      const expectedStates=result.mode==='mesa-xvfb' || result.browser!=='firefox'
        ? ['initial','rendered','active-controls','closed']
        : result.states?.includes(prefix+'fail-closed')?['initial','fail-closed']:['initial','rendered','active-controls','closed'];
      assert(JSON.stringify(result.states)===JSON.stringify(expectedStates.map(s=>prefix+s)),'missing or forged audit state');
    }
  }
  assert(seen.size===expected.size,'missing browser evidence');
  return true;
}
function main() {
  const [mode,...args]=process.argv.slice(2);
  const manifest=loadManifest();
  if(mode==='--check' && args.length===0){
    console.log('C3-R53 evidence manifest: source-only HOLD / manual NOT_TESTED PASS');
    return;
  }
  if(mode==='--assemble'&&args.length===3) {
    const [standard,strict,destination]=args;
    const output=path.resolve(destination),local=path.resolve(root,'_local');
    assert(output.startsWith(local+path.sep),'evidence output must stay under _local');
    const report=assembleEvidence(manifest,JSON.parse(fs.readFileSync(standard)),JSON.parse(fs.readFileSync(strict)),{
      commit:process.env.GITHUB_SHA??'local-test'
    });
    validateEvidence(report,manifest);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'w'});
    console.log('C3-R53 automated evidence verified: '+report.automatedChecks.length+' required browser/surface checks; manual NOT_TESTED; release HOLD');
    return;
  }
  throw Error('usage: --check OR --assemble <standard-playwright.json> <strict-playwright.json> <_local/output.json>');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
