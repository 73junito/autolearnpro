# C3-R45 — Linux Firefox WebGL debug and strict visual gate

**Scope:** source-only, development and testing. Production deployment, catalog publication, live student data, DNS, Cloudflare Workers and hosted Supabase remain on HOLD.

## Verified prior problem

C3-R44 GitHub Actions run 44653557521 returned Firefox `webgl:false` and `webgl2:false`, with `FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS` on the Ubuntu runner. Firefox on Windows rendered the same integrity-verified synthetic triangle and returned 14,705 blue pixels. This points to a test-runner graphics path rather than a failed R39 asset SHA-256 check, but does not by itself establish a Linux solution.

## Isolated investigation

The existing R43/R44 headless cross-browser tests remain intact. In addition, the required Foundation/Academic job now provisions disposable Ubuntu Mesa software OpenGL, `mesa-utils`, and Xvfb. A separate R45 step launches **headful Firefox inside the Xvfb virtual display** with `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`, and X11 mode. It records `glxinfo -B`, then runs the existing verified-triangle pixel test with `C3_R45_REQUIRE_FIREFOX_PIXELS=1`.

The strict pixel gate rejects **any** no-WebGL fallback; a successful fallback from the earlier R44 diagnostic is not proof of graphics. Expected evidence: zero `gl.getError()`, more than 200 opaque blue pixels and more than 20 center blue pixels. If these are unavailable, GitHub required CI fails and the branch must not be merged until fixed or the test scope is redesigned with an explicit separate approval.

Only the R45 test process sets `headless: false` under a virtual display. The app's normal catalog build and viewer production authorization are unchanged. Browser sandbox controls are not disabled, and no unsigned data or external model is loaded.

## Reproducibility and decision

GitHub runner reference: Ubuntu `ubuntu-latest` in the existing mandatory Foundation/Academic gate. Browser: pinned Playwright Firefox. Investigation is controlled by these environment variables in the R45 CI step:

```text
LIBGL_ALWAYS_SOFTWARE=1
GALLIUM_DRIVER=llvmpipe
MOZ_ENABLE_WAYLAND=0
C3_R45_FIREFOX_HEADFUL=1
C3_R45_REQUIRE_FIREFOX_PIXELS=1
```

On failure, preserve console WebGL warnings, Mesa diagnostic output and the full GitHub run URL in the PR before deciding a next experiment. No branch-protection bypass, unattended release, or source change outside the isolated worktree.
