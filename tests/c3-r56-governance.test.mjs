import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateGovernance,sealEvent,verifyGovernanceFiles} from '../infrastructure/scripts/c3-r56-governance.mjs';

const manual=JSON.parse(fs.readFileSync(new URL('../docs/c3-r54/manual-accessibility-evidence.json',import.meta.url)));
const reviews=JSON.parse(fs.readFileSync(new URL('../docs/c3-r55/manual-reviews.json',import.meta.url)));
const ledger=JSON.parse(fs.readFileSync(new URL('../docs/c3-r56/governance-ledger.json',import.meta.url)));
const copy=(o)=>structuredClone(o);
const digest=(v)=>createHash('sha256').update(v).digest('hex');

function fixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r56-governance-'));
  const reference='docs/c3-r54/evidence/case.txt';
  const file=path.join(root,reference);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const bytes=Buffer.from('Synthetic test fixture: not an actual assistive technology result.');
  fs.writeFileSync(file,bytes);
  const m=copy(manual),r=copy(reviews),g=copy(ledger),c=m.checks[0];
  const hash=digest(bytes),sourceCommit='a'.repeat(40);
  Object.assign(c,{status:'PASS',tester:'tester-01',testedOn:'2026-11-20',
    platformVersion:'synthetic-windows',browserVersion:'synthetic-firefox',atVersion:'synthetic-nvda',
    evidence:[{reference,sha256:hash,observations:'Synthetic fixture observations only, not human testing.'}]});
  r.reviews.push({checkId:c.id,reviewer:'reviewer-02',reviewedOn:'2026-11-20',
    decision:'APPROVED',evidenceSha256:[hash],notes:'Fixture-only review, not a real accessibility review.'});
  g.registry.push(
    {id:'tester-01',role:'TESTER',verifiedBy:'admin-03',verificationRef:'https://github.com/73junito/autolearnpro/issues/1'},
    {id:'reviewer-02',role:'REVIEWER',verifiedBy:'admin-03',verificationRef:'https://github.com/73junito/autolearnpro/issues/2'}
  );
  const first=sealEvent({sequence:1,eventId:'event-submit-01',checkId:c.id,
    action:'SUBMITTED',actorId:'tester-01',recordedOn:'2026-11-20',
    sourceCommit,evidenceSha256:[hash],previousDigest:'0'.repeat(64)});
  const second=sealEvent({sequence:2,eventId:'event-review-01',checkId:c.id,
    action:'REVIEWED',actorId:'reviewer-02',recordedOn:'2026-11-20',
    sourceCommit,evidenceSha256:[hash],previousDigest:first.digest});
  g.events.push(first,second);
  try {fn({root,file,m,r,g,c,hash,first,second});}
  finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('R56 repository baseline has no actors or custody and remains HOLD',()=>{
  const result=verifyGovernanceFiles();
  assert.deepEqual([result.registeredIdentities,result.custodyEvents,result.completed],[0,0,0]);
  assert.equal(result.releaseStatus,'HOLD');
});
test('positive synthetic fixture verifies two independent actors and linked custody',()=>{
  fixture(({root,m,r,g})=>{
    const x=validateGovernance(m,r,g,{root});
    assert.equal(x.custodyEvents,2);
    assert.equal(x.releaseStatus,'HOLD');
  });
});
test('forged release and authorization are rejected',()=>{
  fixture(({root,m,r,g})=>{
    for(const [k,v] of [['releaseStatus','READY'],['certification','WCAG_CERTIFIED'],['manualAuthorization','GRANTED']]){
      const bad=copy(g);bad[k]=v;
      assert.throws(()=>validateGovernance(m,r,bad,{root}),/release authority/);
    }
  });
});
test('duplicate actors, fake role and absent identity verification are rejected',()=>{
  fixture(({root,m,r,g})=>{
    const duplicate=copy(g);duplicate.registry.push(copy(duplicate.registry[0]));
    assert.throws(()=>validateGovernance(m,r,duplicate,{root}),/duplicate\/invalid identity/);
    const role=copy(g);role.registry[1].role='RELEASE_AUTHORITY';
    assert.throws(()=>validateGovernance(m,r,role,{root}),/invalid identity role/);
    const proof=copy(g);proof.registry[0].verificationRef='https://example.com/claim';
    assert.throws(()=>validateGovernance(m,r,proof,{root}),/identity verification reference/);
  });
});
test('cannot submit untested work or review without submission',()=>{
  fixture(({root,m,r,g})=>{
    const noSubmit=copy(g);noSubmit.events.shift();
    assert.throws(()=>validateGovernance(m,r,noSubmit,{root}),/custody sequence|hash-chain/);
    const stillUntested=copy(manual);
    assert.throws(()=>validateGovernance(stillUntested,copy(reviews),g,{root}),/cannot submit or review untested/);
  });
});
test('hash chain, ordering, duplicate event IDs and source revision are enforced',()=>{
  fixture(({root,m,r,g})=>{
    const tampered=copy(g);tampered.events[0].sourceCommit='b'.repeat(40);
    assert.throws(()=>validateGovernance(m,r,tampered,{root}),/hash-chain broken/);
    const noParent=copy(g);noParent.events[1].previousDigest='0'.repeat(64);
    assert.throws(()=>validateGovernance(m,r,noParent,{root}),/hash-chain broken/);
    const swapped=copy(g);swapped.events.reverse();
    assert.throws(()=>validateGovernance(m,r,swapped,{root}),/custody sequence/);
    const duplicate=copy(g);duplicate.events[1].eventId=duplicate.events[0].eventId;
    assert.throws(()=>validateGovernance(m,r,duplicate,{root}),/duplicated custody event/);
    const wrongRevision=copy(g);
    const event=wrongRevision.events[1];
    const unsigned=Object.fromEntries(Object.entries(event).filter(([key])=>key!=='digest'));
    wrongRevision.events[1]=sealEvent({...unsigned,sourceCommit:'b'.repeat(40)});
    assert.throws(()=>validateGovernance(m,r,wrongRevision,{root}),/test revision changed/);
  });
});
test('reviewer must be distinct from tester and match the human review ledger',()=>{
  fixture(({root,m,r,g})=>{
    const changed=copy(g);changed.registry[1].role='TESTER';
    assert.throws(()=>validateGovernance(m,r,changed,{root}),/reviewer must be independent/);
    const wrong=copy(r);wrong.reviews[0].reviewer='other-04';
    assert.throws(()=>validateGovernance(m,wrong,g,{root}),/review ledger does not corroborate|independent human review/);
    const missing=copy(g);missing.events.pop();
    assert.throws(()=>validateGovernance(m,r,missing,{root}),/missing reviewed\/rejected custody/);
  });
});
test('real file tampering fails R55 integrity before R56 validation',()=>{
  fixture(({root,file,m,r,g})=>{
    fs.writeFileSync(file,'tampered');
    assert.throws(()=>validateGovernance(m,r,g,{root}),/hash mismatch/);
  });
});
