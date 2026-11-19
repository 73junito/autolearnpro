// C3-R25 read-only integration review. No deploy, merge or copy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'c3-integration-source-manifest.json'),'utf8'));
const proposal=fs.readFileSync(path.join(here,'c3-validation.example.yml'),'utf8');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:12000}).trim();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let passed=0,failed=0;
const test=(name,ok)=>{if(ok)passed++;else failed++;console.log((ok?'PASS ':'FAIL ')+name);};
try {
 test('isolated-integration-branch',git('branch','--show-current')==='integration/c3-r25-ci-readiness');
 test('expected-committed-base',git('rev-parse','HEAD')==='ea67a032d94bf283ab458c45bc622e75f1a219f1');
 test('authoritative-origin',git('remote','get-url','origin')==='https://github.com/73junito/autolearnpro.git');
 test('existing-cloudflare-workflow-left-in-place',fs.existsSync(path.join(root,'.github/workflows/cloudflare-foundation-staging.yml')));
 test('proposal-is-not-installed-workflow',!fs.existsSync(path.join(root,'.github/workflows/c3-validation.yml')));
 test('no-c3-runtime-files-copied',!fs.existsSync(path.join(root,'lib/assets/build-evidence-r22.mjs')));
 test('manifest-denies-publishing-or-copying',manifest.copyAuthorized===false&&manifest.deployAllowed===false&&manifest.sourceCommitVerified===false);
 test('seven-reviewed-module-fingerprints',Array.isArray(manifest.files)&&manifest.files.length===7&&manifest.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256))&&manifest.files.some(x=>x.path==='lib/assets/library-pair-recovery.mjs'));
 const staging=manifest.sourceWorkspace;
 const available=fs.existsSync(staging);
 test('staging-source-available-for-review',available);
 if(available){
  test('staging-sources-match-review-fingerprints',manifest.files.every(({path:name,sha256})=>{
   const loc=path.join(staging,...name.split('/'));
   return fs.existsSync(loc)&&sha(fs.readFileSync(loc))===sha256;
  }));
 }
 test('workflow-template-requires-reviewed-port',proposal.includes('Reject absent C3 integration')&&proposal.includes('npm run verify:c3-staging'));
 test('workflow-token-read-only',/permissions:\s*\n\s*contents: read/.test(proposal));
 test('workflow-release-disabled',proposal.includes('if: ${{ false }}'));
 test('no-direct-deploy-commands',!/^\s*run:.*\b(?:wrangler\s+deploy|vercel\s+deploy|git\s+push)\b/gim.test(proposal));
 console.log('C3-R25 RESULTS',JSON.stringify({passed,failed,checks:passed+failed}));
 console.log('C3-R25 RESULT:',failed?'FAIL':'PASS');
 process.exitCode=failed?1:0;
}catch(e){console.error('C3-R25 ERROR:',e.message);process.exitCode=1;}
