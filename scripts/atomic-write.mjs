import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

export function writeFileAtomic(target, text, beforeRename) {
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    if (beforeRename) beforeRename(tmp);
    renameSync(tmp, target);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
}
