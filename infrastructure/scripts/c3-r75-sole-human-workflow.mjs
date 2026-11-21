// C3-R75 sole-human developer policy: internal only, never independent review or production approval.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
export const policyFile=path.join(repoRoot,'docs/c3-r75/sole-human-policy.json');
export const workflowFile=path.join(repoRoot,'.github/workflows/r1-pr-validation.yml');
const keys=['schemaVersion','milestone','scope','humanDeveloperCount','humanMaintainerCount',
  'humanTesterCount','humanReviewerCount','reviewMode','secondHumanReviewerRequired',
  'independentHumanVerificationRequiredForDevelopment','legacyR55R56','ownerEvidenceStatus',
  'r54FormalCasesCompleted','r66FormalOwnerReviewsCompleted','releaseStatus',
  'certification','manualAuthorization','note'];
const fail=message=>{throw Error('C3-R75 sole-human policy denied: '+message);};
const requireCheck=(ok,message)=>{if(!ok)fail(message);};
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  JSON.stringify(Object.keys(value).sort())===JSON.stringify(fields.slice().sort());

export function validateSoleHumanPolicy(policy,{workflow,manual,ownerLedger}={}){
  requireCheck(exact(policy,keys),'unexpected or missing policy fields');
  requireCheck(policy.schemaVersion===1&&policy.milestone==='C3-R75'&&
    policy.scope==='internal-development-only','policy scope or schema altered');
  requireCheck(['humanDeveloperCount','humanMaintainerCount','humanTesterCount','humanReviewerCount']
    .every(key=>policy[key]===1),'sole human roles not enforced');
  requireCheck(policy.reviewMode==='SOLE_OWNER_NOT_INDEPENDENT'&&
    policy.secondHumanReviewerRequired===false&&
    policy.independentHumanVerificationRequiredForDevelopment===false,
    'independent person wrongly required or owner mode changed');
  requireCheck(policy.legacyR55R56==='OPTIONAL_SEPARATE_FORMAL_EVIDENCE_PATH'&&
    policy.ownerEvidenceStatus==='PARTIAL_ATTESTED_NOT_FORMALLY_COMPLETE',
    'legacy formal review or evidence classification falsified');
  requireCheck(policy.releaseStatus==='HOLD'&&
    policy.certification==='NOT_CERTIFIED'&&
    policy.manualAuthorization==='NOT_GRANTED','release/certification authority forged');
  requireCheck(typeof policy.note==='string'&&policy.note.length>=100&&
    policy.note.includes('GitHub protections')&&policy.note.includes('Legacy R55/R56'),
    'limits and non-bypass policy missing');
  requireCheck(manual && Array.isArray(manual.checks),'R54 manifest unavailable');
  const actualCompleted=manual.checks.filter(c=>c.status!=='NOT_TESTED').length;
  requireCheck(policy.r54FormalCasesCompleted===actualCompleted &&
    manual.releaseStatus==='HOLD'&&manual.certification==='NOT_CERTIFIED'&&
    manual.manualAuthorization==='NOT_GRANTED','R54 case count or release state fabricated');
  requireCheck(ownerLedger && Array.isArray(ownerLedger.entries),'R66 ledger unavailable');
  requireCheck(policy.r66FormalOwnerReviewsCompleted===ownerLedger.entries.length &&
    ownerLedger.reviewMode==='SOLE_OWNER_NOT_INDEPENDENT'&&
    ownerLedger.releaseStatus==='HOLD'&&ownerLedger.certification==='NOT_CERTIFIED'&&
    ownerLedger.manualAuthorization==='NOT_GRANTED',
    'R66 owner review count or release state fabricated');
  requireCheck(typeof workflow==='string'&&workflow.length>100,'CI workflow unavailable');
  for(const script of ['c3-r54-manual-evidence.mjs','c3-r55-evidence-integrity.mjs',
    'c3-r56-governance.mjs','c3-r66-owner-review.mjs','c3-r75-sole-human-workflow.mjs']){
    requireCheck(workflow.includes('node infrastructure/scripts/'+script+' --check'),
      'CI guard missing: '+script);
  }
  requireCheck(workflow.includes('node --test tests/c3-r75-sole-human-workflow.test.mjs'),
    'C3-R75 negative-control tests missing');
  requireCheck(workflow.includes('npm run check:r8-release-hold'),'R8 HOLD gate missing');
  requireCheck(workflow.includes('SOLE_OWNER_NOT_INDEPENDENT')&&
    workflow.includes('No second human reviewer required for internal development'),
    'sole human CI statement missing');
  return {milestone:'C3-R75',humanDevelopers:1,humanMaintainers:1,
    humanTesters:1,humanReviewers:1,secondHumanReviewerRequired:false,
    formalR54Completed:actualCompleted,ownerLedgerEntries:ownerLedger.entries.length,
    independentlyReviewedClaimed:false,releaseStatus:'HOLD'};
}
export function verifySoleHumanPolicy(){
  return validateSoleHumanPolicy(JSON.parse(fs.readFileSync(policyFile,'utf8')),{
    workflow:fs.readFileSync(workflowFile,'utf8'),
    manual:JSON.parse(fs.readFileSync(path.join(repoRoot,'docs/c3-r54/manual-accessibility-evidence.json'),'utf8')),
    ownerLedger:JSON.parse(fs.readFileSync(path.join(repoRoot,'docs/c3-r66/owner-review-ledger.json'),'utf8'))
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  requireCheck(process.argv.length===3&&process.argv[2]==='--check','usage: --check');
  const result=verifySoleHumanPolicy();
  console.log('C3-R75 PASS: 1 human developer/maintainer/tester/reviewer; no second human required for internal development; formal R54 '+result.formalR54Completed+'/6; R66 '+result.ownerLedgerEntries+' owner ledger entries; release HOLD');
}
