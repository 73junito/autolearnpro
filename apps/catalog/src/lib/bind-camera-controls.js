/**
 * C3-R50 native keyboard buttons; no global listeners, pointer capture,
 * continuous animation or model data access. All controls are opt-in.
 */
export function bindCameraControls(fieldset, getSession, announce) {
  if (!fieldset || typeof getSession !== 'function' || typeof announce !== 'function') {
    throw Error('camera control bindings require an explicit fieldset/session/status');
  }
  const handler = (event) => {
    const button = event.target.closest('button[data-camera-action]');
    if (!button || !fieldset.contains(button) || fieldset.disabled) return;
    const session = getSession();
    if (!session || session.status !== 'ready') return;
    try {
      const state = session.control(button.dataset.cameraAction);
      announce('View: horizontal ' + state.azimuth + ' degrees, vertical ' +
        state.elevation + ' degrees, distance ' + state.distance + '.');
    } catch {
      announce('Camera control unavailable. Close and reverify the viewer.');
    }
  };
  fieldset.addEventListener('click', handler);
  return Object.freeze({
    enable() { fieldset.disabled = false; },
    disable() { fieldset.disabled = true; },
    dispose() { fieldset.removeEventListener('click', handler); fieldset.disabled = true; }
  });
}
