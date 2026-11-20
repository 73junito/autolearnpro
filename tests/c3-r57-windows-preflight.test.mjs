import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readPlan,planFile,validatePlan,localPreflightFacts,checkLoopback} from '../infrastructure/scripts/c3-r57-windows-preflight.mjs';

const baseline=JSON.parse(fs.readFileSync(planFile,'utf8'));
const clone=()=>structuredClone(baseline);
test('source-only R57 session plan is unstarted, restricted and HOLD',()=>{
  assert.equal(readPlan().status,'PLAN_ONLY');
  assert.equal(baseline.sessionStatus,'NOT_STARTED');
  assert.equal(baseline.sourceCommit,null);
});
test('reject fake session completion and release/certification promotion',()=>{
  for(const [key,value] of [
    ['releaseStatus','READY'],['certification','CERTIFIED'],
    ['manualAuthorization','GRANTED'],['sessionStatus','PASSED']
  ]){
    const d=clone();d[key]=value;
    assert.throws(()=>validatePlan(d),/session or release status forged/);
  }
});
test('reject invented host/browser/assistive technology measurements',()=>{
  for(const key of ['sourceCommit','windowsBuild','nvdaVersion','firefoxVersion','chromiumVersion']){
    const d=clone();d[key]='invented';
    assert.throws(()=>validatePlan(d),/unverified environment value asserted/);
  }
});
test('reject widened origin or missing scenarios',()=>{
  const d=clone();d.origin='https://public.example';
  assert.throws(()=>validatePlan(d),/loopback/);
  const x=clone();x.testCases.pop();
  assert.throws(()=>validatePlan(x),/surfaces or cases/);
  const y=clone();y.surfaces=['/viewer-demo.html'];
  assert.throws(()=>validatePlan(y),/surfaces or cases/);
});
test('local preflight rejects non-Windows hosts, old Node and dirty source',()=>{
  assert.throws(()=>localPreflightFacts({platform:'linux'}),/Windows/);
  assert.throws(()=>localPreflightFacts({platform:'win32',nodeVersion:'20.0.0'}),/Node 22/);
  assert.throws(()=>localPreflightFacts({platform:'win32',nodeVersion:'22.1.0',gitCommand:(bin,args)=>args[0]==='rev-parse'?'a'.repeat(40):' M changed.txt'}),/clean/);
});
test('local preflight records commit but does not claim NVDA validation',()=>{
  const d=localPreflightFacts({platform:'win32',nodeVersion:'22.1.0',gitCommand:(bin,args)=>args[0]==='rev-parse'?'a'.repeat(40):''});
  assert.equal(d.atStatus,'NOT_VERIFIED');
  assert.equal(d.releaseStatus,'HOLD');
});
test('loopback check verifies only HTML page reachability',async()=>{
  const calls=[];
  const fake=async url=>{
    calls.push(url);
    return {ok:true,status:200,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>'<html><body>Synthetic fixture</body></html>'};
  };
  const r=await checkLoopback(undefined,fake);
  assert.equal(r.observations.length,2);
  assert.equal(r.atStatus,'NOT_VERIFIED');
  assert.ok(calls.every(u=>u.startsWith('http://127.0.0.1:4178/')));
});
test('loopback check rejects remote URL, non-HTML and failures',async()=>{
  await assert.rejects(checkLoopback('http://0.0.0.0:4178',async()=>{}),/unapproved origin/);
  await assert.rejects(checkLoopback(undefined,async()=>({ok:false})),/failed to load/);
  await assert.rejects(checkLoopback(undefined,async()=>({ok:true,headers:{get:()=> 'application/json'}})),/not HTML/);
});
