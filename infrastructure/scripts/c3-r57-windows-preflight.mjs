// C3-R57-A: source-only plan gate plus optional local Windows environment preflight.
// Never marks human AT testing complete and never authorizes production release.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const root=fileURLToPath(new URL('../../',import.meta.url));
export const planFile=path.join(root,'docs/c3-r57/windows-nvda-session-plan.json');
const deny=(reason)=>{throw Error('C3-R57 preflight denied: '+reason);};
const requireCheck=(ok,reason)=>{if(!ok)deny(reason);};
const expectedCases=['nvda-windows-firefox','nvda-windows-chromium'];
const expectedPages=['/viewer-demo.html','/indexed-demo.html'];
const checklist=['source revision','Windows and browser versions','NVDA installed and enabled','live spoken control names','keyboard navigation and focus','live announcements and error recovery','independent human reviewer'];
const keys=['schemaVersion','milestone','scope','releaseStatus','certification','manualAuthorization','sessionStatus','origin','surfaces','testCases','sourceCommit','windowsBuild','architecture','nodeVersion','nvdaVersion','firefoxVersion','chromiumVersion','manualChecks','note'];
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validatePlan(plan){
  requireCheck(plan && typeof plan==='object' && !Array.isArray(plan),'plan missing');
  requireCheck(JSON.stringify(Object.keys(plan).sort())===JSON.stringify([...keys].sort()),'unexpected or missing plan fields');
  requireCheck(plan.schemaVersion===1 && plan.milestone==='C3-R57' && plan.scope==='development-only-synthetic-viewers','scope mismatch');
  requireCheck(plan.releaseStatus==='HOLD' && plan.certification==='NOT_CERTIFIED' &&
    plan.manualAuthorization==='NOT_GRANTED' && plan.sessionStatus==='NOT_STARTED','session or release status forged');
  requireCheck(plan.origin==='http://127.0.0.1:4178','must bind to isolated loopback');
  requireCheck(exact(plan.surfaces,expectedPages) && exact(plan.testCases,expectedCases),'required surfaces or cases missing');
  requireCheck(exact(plan.manualChecks,checklist),'manual checklist altered');
  for(const key of ['sourceCommit','windowsBuild','architecture','nodeVersion','nvdaVersion','firefoxVersion','chromiumVersion']){
    requireCheck(plan[key]===null,'unverified environment value asserted: '+key);
  }
  requireCheck(typeof plan.note==='string' && plan.note.includes('human'),'manual limitations missing');
  return {status:'PLAN_ONLY',checks:plan.testCases.length,releaseStatus:'HOLD'};
}
export function readPlan(){return validatePlan(JSON.parse(fs.readFileSync(planFile,'utf8')));}
function command(program,args){return execFileSync(program,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:8000}).trim();}
export function localPreflightFacts({platform=process.platform,nodeVersion=process.versions.node,gitCommand=command}={}){
  requireCheck(platform==='win32','Windows host required for this local preflight');
  requireCheck(/^22\./.test(nodeVersion),'repository requires Node 22');
  const sha=gitCommand('git',['rev-parse','HEAD']);
  requireCheck(/^[a-f0-9]{40}$/.test(sha),'cannot pin exact tested source revision');
  requireCheck(gitCommand('git',['status','--porcelain']).length===0,'working tree must be clean');
  return {sourceCommit:sha,platform:'win32',nodeVersion,releaseStatus:'HOLD',atStatus:'NOT_VERIFIED'};
}
export async function checkLoopback(origin='http://127.0.0.1:4178',fetchImpl=fetch){
  requireCheck(origin==='http://127.0.0.1:4178','unapproved origin');
  const observations=[];
  for(const route of expectedPages){
    const response=await fetchImpl(origin+route,{signal:AbortSignal.timeout(4000)});
    requireCheck(response.ok,'viewer failed to load: '+route);
    const contentType=response.headers.get('content-type')??'';
    requireCheck(/text\/html/i.test(contentType),'viewer is not HTML: '+route);
    const body=await response.text();
    requireCheck(/<html\b/i.test(body) && /<body\b/i.test(body),'unexpected viewer response: '+route);
    observations.push({route,httpStatus:response.status,reachable:true});
  }
  return {origin,observations,releaseStatus:'HOLD',atStatus:'NOT_VERIFIED'};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const mode=process.argv[2];
  requireCheck(process.argv.length===3 && ['--check','--local'].includes(mode),'usage: --check or --local');
  const status=readPlan();
  if(mode==='--check'){
    console.log('C3-R57 session PLAN checked: '+status.checks+' Windows/NVDA cases NOT_STARTED; release HOLD');
  }else{
    const facts=localPreflightFacts();
    const pageChecks=await checkLoopback();
    console.log(JSON.stringify({session:'PRECONDITIONS_ONLY',...facts,...pageChecks},null,2));
    console.log('Human must independently confirm NVDA, browser versions and actual spoken behavior; no manual test recorded.');
  }
}
