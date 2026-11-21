// C3-R82: enforce truthful historical closure, not a completed NVDA test or release.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
const workflowPath=path.join(repoRoot,'.github/workflows/r1-pr-validation.yml');
const fail=(message)=>{throw Error('C3-R82 historical disposition denied: '+message);};
const check=(condition,message)=>{if(!condition)fail(message);};
const eqKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  JSON.stringify(Object.keys(v).sort())===JSON.stringify(keys.slice().sort());
const hex64=/^[a-f0-9]{64}$/;
const hex40=/^[a-f0-9]{40}$/;

export function validateHistoricalDisposition(d,{workflow,ownerPolicy,r54,r66}={}){
  check(eqKeys(d,['schemaVersion','milestone','scope','historicalDisposition','ownerReviewMode',
    'secondHumanRequiredForDevelopment','historicalFormalManualAcceptance',
    'historicalNativeSpeechCompleteness','evidence','manualOnlyGaps',
    'engineeringVerification','r54FormalCompletionAtClosure','r66OwnerEntriesAtClosure',
    'releaseStatus','certification','manualAuthorization','closureNote']),
    'unexpected or missing metadata keys');
  check(d.schemaVersion===1&&d.milestone==='C3-R82'&&
    d.scope==='internal-development-historical-evidence-metadata-only',
    'scope or schema changed');
  check(d.historicalDisposition==='CLOSED_WITH_DISCLOSED_LIMITATIONS'&&
    d.historicalFormalManualAcceptance==='NOT_COMPLETED'&&
    d.historicalNativeSpeechCompleteness==='NOT_VERIFIED',
    'historic evidence wrongly promoted to completed/certified');
  check(d.ownerReviewMode==='SOLE_OWNER_NOT_INDEPENDENT'&&
    d.secondHumanRequiredForDevelopment===false,'human reviewer mode altered');
  check(d.releaseStatus==='HOLD'&&d.certification==='NOT_CERTIFIED'&&
    d.manualAuthorization==='NOT_GRANTED','release controls must remain HOLD');
  check(Array.isArray(d.evidence)&&d.evidence.length===3,'expected exact evidence classes');
  const expected=[
    ['triangle-owner-identified-raw','OWNER_IDENTIFIED_ORIGINAL_SPEECH_TEXT',
      'BYTES_VERIFIED_PARTIAL_OPEN_RENDER_ONLY',4228,
      'bd83e823a7c18b19c8afb8aa520ea15dda85a9e10ed0d354274e5b2e5bcb3e4a'],
    ['triangle-conversation-derivative','OWNER_ATTESTED_CONVERSATION_DERIVATIVE',
      'CAMERA_SEQUENCE_NOT_CORROBORATED_BY_RAW_FILE',8844,
      'a4d309287db120306b8597d00856d5baae40b276d0c20888a031f22fb685fe7e'],
    ['indexed-cube-conversation-derivative','OWNER_ATTESTED_CONVERSATION_DERIVATIVE',
      'SEPARATE_NATIVE_ORIGINAL_NOT_LOCATED',10726,
      'b5f0ed15326246f7c931351f7d74fed92547d4a4cff6cd5dc12985117bae24c2']
  ];
  for(let i=0;i<expected.length;i++){
    const e=d.evidence[i]; const [id,kind,status,bytes,sha]=expected[i];
    check(eqKeys(e,['id','kind','status','bytes','sha256','location']),
      'unexpected evidence fields, raw content or paths');
    check(e.id===id&&e.kind===kind&&e.status===status&&e.bytes===bytes&&
      e.sha256===sha&&hex64.test(e.sha256)&&
      e.location==='PRIVATE_LOCAL_OWNER_CUSTODY_NOT_REPOSITORY',
      'evidence provenance, count or privacy violated: '+id);
  }
  const gaps=[
    'UNVERIFIED_NVDA_SPEECH_AT_CAMERA_BOUNDS',
    'UNVERIFIED_ACTUAL_ENTER_SPACE_KEY_SEQUENCES',
    'UNVERIFIED_NVDA_POST_CLOSE_FOCUS_AND_REOPEN',
    'UNVERIFIED_NVDA_ERROR_AND_RETRY_SPEECH',
    'UNVERIFIED_HISTORICAL_SESSION_TO_SOURCE_BUILD'
  ];
  check(Array.isArray(d.manualOnlyGaps)&&
    JSON.stringify(d.manualOnlyGaps)===JSON.stringify(gaps),'unverified manual cases hidden');
  check(eqKeys(d.engineeringVerification,['kind','mergedMainAtClosure','ciRun','status'])&&
    d.engineeringVerification.kind==='BROWSER_ONLY_NOT_NATIVE_NVDA'&&
    d.engineeringVerification.mergedMainAtClosure==='d8f62198bf2439963a07d2313c815af12d030400'&&
    hex40.test(d.engineeringVerification.mergedMainAtClosure)&&
    d.engineeringVerification.ciRun==='https://github.com/73junito/autolearnpro/actions/runs/44863938265'&&
    d.engineeringVerification.status==='SUCCESS_3_OF_3',
    'historical browser verification provenance altered');
  check(d.r54FormalCompletionAtClosure===0&&d.r66OwnerEntriesAtClosure===0,
    'historical zero completed cases cannot be rewritten');
  check(typeof d.closureNote==='string'&&d.closureNote.length>=90&&
    d.closureNote.includes('No source-build provenance'),'closure limitations missing');
  check(ownerPolicy?.reviewMode==='SOLE_OWNER_NOT_INDEPENDENT'&&
    ownerPolicy.secondHumanReviewerRequired===false&&ownerPolicy.releaseStatus==='HOLD',
    'R75 owner governance missing');
  check(Array.isArray(r54?.checks)&&r54.releaseStatus==='HOLD','R54 formal baseline missing');
  check(Array.isArray(r66?.entries)&&r66.releaseStatus==='HOLD'&&
    r66.reviewMode==='SOLE_OWNER_NOT_INDEPENDENT','R66 owner ledger missing');
  check(typeof workflow==='string'&&workflow.length>100,'CI workflow missing');
  for(const needle of [
    'node infrastructure/scripts/c3-r54-manual-evidence.mjs --check',
    'node infrastructure/scripts/c3-r55-evidence-integrity.mjs --check',
    'node infrastructure/scripts/c3-r56-governance.mjs --check',
    'node infrastructure/scripts/c3-r66-owner-review.mjs --check',
    'node infrastructure/scripts/c3-r75-sole-human-workflow.mjs --check',
    'node infrastructure/scripts/c3-r82-historical-nvda-disposition.mjs --check',
    'node --test tests/c3-r82-historical-nvda-disposition.test.mjs',
    'npm run check:r8-release-hold']){
    check(workflow.includes(needle),'missing CI safeguard '+needle);
  }
  check(workflow.includes('C3-R82 historical NVDA evidence closed with limitations')&&
    workflow.includes('not native NVDA acceptance'),'CI must identify limitation');
  return {historicalDisposition:d.historicalDisposition,
    nativeSpeechCompleteness:d.historicalNativeSpeechCompleteness,
    evidenceEntries:d.evidence.length,unverifiedManualItems:gaps.length,
    independentlyReviewed:false,releaseStatus:'HOLD'};
}
export function verifyHistoricalDisposition(){
  const read=relative=>JSON.parse(fs.readFileSync(path.join(repoRoot,relative),'utf8'));
  return validateHistoricalDisposition(read('docs/c3-r82/historical-nvda-disposition.json'),{
    workflow:fs.readFileSync(workflowPath,'utf8'),
    ownerPolicy:read('docs/c3-r75/sole-human-policy.json'),
    r54:read('docs/c3-r54/manual-accessibility-evidence.json'),
    r66:read('docs/c3-r66/owner-review-ledger.json')
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  check(process.argv.length===3&&process.argv[2]==='--check','usage: --check');
  const result=verifyHistoricalDisposition();
  console.log('C3-R82 PASS: historical NVDA investigation '+result.historicalDisposition+
    '; '+result.evidenceEntries+' provenance classes; '+result.unverifiedManualItems+
    ' manual-only gaps; native NVDA not certified; release HOLD');
}
