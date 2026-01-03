Short accessibility scan helper

This folder includes a convenience script to wait for a locally-running dev server and then run the multi-page Playwright accessibility scans.

Usage:

1. Start the dev server in `frontend/web`:

```powershell
cd frontend/web
npm run dev
```

2. In a separate shell, run the auto-waiting scan:

```powershell
cd frontend/web
npm run a11y:scan:auto
```

The `a11y:scan:auto` script uses `npx wait-on` to wait for `http://localhost:3000` and then runs the existing `a11y:scan` script. Reports are written by the scan runner into the `frontend/web` folder as JSON.

If you prefer to wait manually, run `npm run a11y:scan` after the server is up.

File-based scans (useful when dev server isn't reachable from this environment)

1. Use the saved HTML index list (created earlier at the repo root) to run JS DOM scans without starting the dev server:

```powershell
cd frontend/web
npm run a11y:scan:files
```

2. Quick dry-run to see planned commands without launching scans:

```powershell
cd frontend/web
node tools/run_static_scans_from_file.js ../../outputs/html_pages.txt --dry-run --max 20
```

Reports are written to `frontend/web/a11y-reports/` as JSON files. Use `--max N` to limit the number of files scanned for a quick smoke test.
