import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCameraState,nextCameraState,CAMERA_LIMITS,CAMERA_ACTIONS}
  from '../apps/catalog/src/lib/camera-controls.js';
test('bounded controls have deterministic immutable starting values',()=>{
  assert.deepEqual(initialCameraState(false),{azimuth:0,elevation:0,distance:3});
  assert.deepEqual(initialCameraState(true),{azimuth:25,elevation:15,distance:5});
  assert.ok(Object.isFrozen(initialCameraState()));
  assert.deepEqual(CAMERA_ACTIONS,['left','right','up','down','zoom-in','zoom-out','reset']);
});
test('rotation/elevation/zoom clamp under repeated keyboard activations',()=>{
  let s=initialCameraState(true);
  for(let i=0;i<100;i++) s=nextCameraState(s,'right',true);
  assert.equal(s.azimuth,CAMERA_LIMITS.azimuthMax);
  for(let i=0;i<100;i++) s=nextCameraState(s,'left',true);
  assert.equal(s.azimuth,CAMERA_LIMITS.azimuthMin);
  for(let i=0;i<100;i++) s=nextCameraState(s,'up',true);
  assert.equal(s.elevation,CAMERA_LIMITS.elevationMax);
  for(let i=0;i<100;i++) s=nextCameraState(s,'down',true);
  assert.equal(s.elevation,CAMERA_LIMITS.elevationMin);
  for(let i=0;i<100;i++) s=nextCameraState(s,'zoom-in',true);
  assert.equal(s.distance,CAMERA_LIMITS.distanceMin);
  for(let i=0;i<100;i++) s=nextCameraState(s,'zoom-out',true);
  assert.equal(s.distance,CAMERA_LIMITS.distanceMax);
  assert.deepEqual(nextCameraState(s,'reset',true),initialCameraState(true));
});
test('invalid actions and nonfinite state are denied without mutating caller state',()=>{
  const initial=initialCameraState(false);
  assert.throws(()=>nextCameraState(initial,'infinite-zoom'),TypeError);
  assert.throws(()=>nextCameraState({azimuth:NaN,elevation:0,distance:3},'left'),TypeError);
  assert.deepEqual(initial,initialCameraState(false));
  assert.ok(Object.isFrozen(nextCameraState(initial,'left')));
});
