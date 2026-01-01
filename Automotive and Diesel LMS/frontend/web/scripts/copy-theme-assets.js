const fs = require('fs').promises;
const path = require('path');

function log(...args) { console.log('[copy-theme-assets]', ...args); }

async function removeIfExists(p) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

async function copyRecursive(src, dest) {
  const stats = await fs.stat(src);
  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } else if (stats.isFile()) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

(async function main(){
  try {
    const scriptDir = __dirname; // frontend/web/scripts
    const repoRoot = path.resolve(scriptDir, '..', '..', '..');
    const candidatePaths = [
      path.join(repoRoot, 'theme', 'assets'),
      path.join(scriptDir, '..', 'theme', 'assets'),
      path.join('/', 'theme', 'assets'),
    ];
    let source = null;
    for (const p of candidatePaths) {
      try {
        const s = await fs.stat(p);
        if (s.isDirectory() || s.isFile()) {
          source = p;
          break;
        }
      } catch (e) {
        // not found, try next
      }
    }

    const dest = path.resolve(scriptDir, '..', 'public');

    log('Candidates:', candidatePaths);
    log('Resolved Source:', source || '(none)');
    log('Dest:  ', dest);

    if (!source) {
      log('No theme assets found; skipping copy step.');
      process.exit(0);
    }

    // mirror: remove dest images/icons that came from previous runs to avoid stale files
    await removeIfExists(path.join(dest, 'images'));
    await removeIfExists(path.join(dest, 'icons'));

    // ensure dest exists
    await fs.mkdir(dest, { recursive: true });

    // Copy the entire assets tree
    await copyRecursive(source, dest);

    log('Copy completed.');
    process.exit(0);
  } catch (err) {
    console.error('Error copying theme assets:', err);
    process.exit(2);
  }
})();
