// C3-R36E Phase E fixture — a controlled altered-byte interception.
//
// Loaded with `node --import <this file>` so it runs BEFORE the producer's module graph. It patches
// `fs.readFileSync` on the module object itself, which is the same object every `import fs from 'node:fs'` in the
// contracts receives — so no reviewed contract is edited, and no contract is weakened.
//
// It alters exactly one path, named by R36E_ALTER_TARGET, and only when that path is read. This is how the
// R36D stage-4 guard (`inspection.sha256 !== bundle.output.sha256`) is exercised: the bytes on disk differ from
// the bytes the bundler reported, with no change to any shipped module.
import fs from 'node:fs';

const target = process.env.R36E_ALTER_TARGET;
if (target) {
  const original = fs.readFileSync;
  fs.readFileSync = function alteredRead(file, ...rest) {
    const buffer = original.call(this, file, ...rest);
    if (typeof file === 'string' && file === target && Buffer.isBuffer(buffer)) {
      return Buffer.concat([buffer, Buffer.from('\n// altered between write and read\n')]);
    }
    return buffer;
  };
}
