/**
 * C3-R50: deterministic bounded synthetic-only camera controls.
 * No frame loop, global listeners, external input data or rendering side effects.
 */
const ACTIONS = Object.freeze(['left','right','up','down','zoom-in','zoom-out','reset']);
export const CAMERA_ACTIONS = ACTIONS;
export const CAMERA_LIMITS = Object.freeze({
  azimuthMin:-180,azimuthMax:180,
  elevationMin:-60,elevationMax:60,
  distanceMin:2,distanceMax:7,
  rotateStep:15,zoomStep:0.5
});
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function initialCameraState(indexed=false) {
  return Object.freeze({azimuth:indexed?25:0,elevation:indexed?15:0,distance:indexed?5:3});
}
export function nextCameraState(state,action,indexed=false) {
  if(!ACTIONS.includes(action))throw new TypeError('unsupported camera action');
  if(action==='reset')return initialCameraState(indexed);
  if(!state || !Number.isFinite(state.azimuth) || !Number.isFinite(state.elevation) ||
     !Number.isFinite(state.distance))throw new TypeError('invalid camera state');
  const limits=CAMERA_LIMITS;
  const candidate={
    azimuth:state.azimuth + (action==='left'?-limits.rotateStep:action==='right'?limits.rotateStep:0),
    elevation:state.elevation + (action==='up'?limits.rotateStep:action==='down'?-limits.rotateStep:0),
    distance:state.distance + (action==='zoom-in'?-limits.zoomStep:action==='zoom-out'?limits.zoomStep:0)
  };
  return Object.freeze({
    azimuth:clamp(candidate.azimuth,limits.azimuthMin,limits.azimuthMax),
    elevation:clamp(candidate.elevation,limits.elevationMin,limits.elevationMax),
    distance:clamp(candidate.distance,limits.distanceMin,limits.distanceMax)
  });
}
