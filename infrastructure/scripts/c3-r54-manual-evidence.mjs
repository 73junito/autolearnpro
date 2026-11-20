// C3-R54 source-only manual accessibility evidence gate. No network or release actions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const evidencePath=path.join(root,'docs/c3-r54/manual-accessibility-evidence.json');
export const requiredIds=[
  'nvda-windows-firefox','nvda-windows-chromium','voiceover-macos-safari',
  'mobile-voiceover-talkback','zoom-200-400-high-contrast','assistive-tech-error-recovery'
];
const deny=(message)=>{throw new Error('C3-R54 manual evidence denied: '+message);};
const required=(value,message)=>{if(!value)deny(message);};
const exactKeys=(a,b)=>JSON.stringify(Object.keys(a).sort())===JSON.stringify([...b].sort());
const sha256=/^[0-9a-f]{64}$/;
const date=/^\d{4}-\d{2}-\d{2}$/;
export function validateManualEvidence(doc){
  required(doc && typeof doc==='object' && !Array.isArray(doc),'document missing');
  required(doc.schemaVersion===1 && doc.milestone==='C3-R54' && doc.basedOn==='C3-R53','version/milestone mismatch');
  required(doc.scope==='development-only-synthetic-viewers','scope widened');
  required(doc.releaseStatus==='HOLD' && doc.certification==='NOT_CERTIFIED' && doc.manualAuthorization==='NOT_GRANTED','release or certification forged');
  required(JSON.stringify(doc.surfaces)===JSON.stringify(['/viewer-demo.html','/indexed-demo.html']),'surface scope changed');
  required(Array.isArray(doc.checks)&&doc.checks.length===requiredIds.length,'manual matrix incomplete');
  const seen=new Set();
  for(const c of doc.checks){
    required(c && typeof c==='object' && requiredIds.includes(c.id) && !seen.has(c.id),'unknown or duplicated check');
    seen.add(c.id);
    required(['NOT_TESTED','PASS','FAIL','BLOCKED'].includes(c.status),'invalid test outcome');
    required(typeof c.platform==='string' && c.platform.length>0 && typeof c.browser==='string' && c.browser.length>0 && typeof c.assistiveTechnology==='string' && c.assistiveTechnology.length>0,'missing environment');
    required(Array.isArray(c.evidence),'evidence must be a list');
    if(c.status==='NOT_TESTED'){
      required(c.evidence.length===0 && !c.tester && !c.testedOn,'untested check contains asserted evidence');
    }else{
      required(typeof c.tester==='string'&&c.tester.trim().length>0,'missing human tester');
      required(typeof c.testedOn==='string'&&date.test(c.testedOn)&&!Number.isNaN(Date.parse(c.testedOn)),'missing test date');
      required(typeof c.platformVersion==='string'&&c.platformVersion.trim().length>0,'missing platform version');
      required(typeof c.browserVersion==='string'&&c.browserVersion.trim().length>0,'missing browser version');
      required(typeof c.atVersion==='string'&&c.atVersion.trim().length>0,'missing assistive technology version');
      required(c.evidence.length>0,'missing independent manual evidence reference');
      for(const e of c.evidence){
        required(e && exactKeys(e,['reference','sha256','observations']),'invalid evidence fields');
        required(typeof e.reference==='string' && /^docs\/c3-r54\/evidence\/[a-zA-Z0-9._/-]+$/.test(e.reference) && !e.reference.includes('..'),'untrusted evidence reference');
        required(typeof e.sha256==='string' && sha256.test(e.sha256),'evidence digest absent');
        required(typeof e.observations==='string'&&e.observations.trim().length>=15,'missing manual observations');
      }
      if(c.status==='FAIL'||c.status==='BLOCKED')required(typeof c.issue==='string'&&/^https:\/\/github\.com\/73junito\/autolearnpro\/issues\/\d+$/.test(c.issue),'defect issue reference required');
    }
  }
  required(seen.size===requiredIds.length,'missing required check');
  return {verifiedSchema:true,recordedCompleted:doc.checks.filter(x=>x.status!=='NOT_TESTED').length,releaseStatus:'HOLD',certification:'NOT_CERTIFIED'};
}
export function loadAndVerify(p=evidencePath){
  const resolved=path.resolve(p);
  required(resolved===evidencePath,'manifest path outside pinned source');
  const document=JSON.parse(fs.readFileSync(resolved,'utf8'));
  return validateManualEvidence(document);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3 || process.argv[2]!=='--check')deny('usage: --check');
  const result=loadAndVerify();
  console.log('C3-R54 manual evidence schema PASS; '+result.recordedCompleted+'/6 recorded; release HOLD; NOT_CERTIFIED');
}
