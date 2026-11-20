/** C3-R51: native button activation, deduplicated polite announcements, bounded focus. */
export function bindCameraControls(fieldset, getSession, announce) {
  if (!fieldset || typeof getSession !== 'function' || typeof announce !== 'function') {
    throw Error('camera control bindings require an explicit fieldset/session/status');
  }
  let lastAnnouncement = null;
  const handler = (event) => {
    const button = event.target?.closest?.('button[data-camera-action]');
    if (!button || !fieldset.contains(button) || fieldset.disabled || button.disabled) return;
    const session = getSession();
    if (!session || session.status !== 'ready') return;
    try {
      const state = session.control(button.dataset.cameraAction);
      const message = 'View: horizontal ' + state.azimuth + ' degrees, vertical ' +
        state.elevation + ' degrees, distance ' + state.distance + '.';
      // Avoid repeating identical live-region announcements at camera bounds.
      // No timer, debounce or background loop; every command remains synchronous.
      if (message !== lastAnnouncement) {
        lastAnnouncement = message;
        announce(message);
      }
    } catch {
      announce('Camera control unavailable. Close and reverify the viewer.');
    }
  };
  fieldset.addEventListener('click', handler);
  return Object.freeze({
    enable() { lastAnnouncement = null; fieldset.disabled = false; },
    disable() { fieldset.disabled = true; lastAnnouncement = null; },
    dispose() {
      fieldset.removeEventListener('click', handler);
      fieldset.disabled = true;
      lastAnnouncement = null;
    }
  });
}
