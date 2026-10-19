import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { findHiddenCode, mayContainHiddenCode } from '../core/hidden';
import type { HiddenCodeHit } from '../core/types';

const CODE_FILE = /\.(?:[cm]?js|jsx|ts|tsx)$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Parallel reads: much faster on Windows, where antivirus inspects each file on open. */
const CONCURRENCY = 32;

export interface ScanStats {
  files: number;
  bytes: number;
}

/** List every code file under a folder. */
async function listCodeFiles(folder: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs: Promise<void>[] = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) subdirs.push(walk(path));
      else if (entry.isFile() && CODE_FILE.test(entry.name)) files.push(path);
    }
    await Promise.all(subdirs);
  };
  await walk(folder);
  return files;
}

/** Scan every JavaScript/TypeScript file under an extension folder for hidden-code runs. */
export async function scanExtensionFolder(
  folder: string,
  stats?: ScanStats,
): Promise<HiddenCodeHit[]> {
  const files = await listCodeFiles(folder);
  const hits: HiddenCodeHit[] = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const path = files[next++]!;
      let bytes: Buffer;
      try {
        if ((await stat(path)).size > MAX_FILE_BYTES) continue;
        bytes = await readFile(path);
      } catch {
        continue;
      }
      if (stats) {
        stats.files++;
        stats.bytes += bytes.length;
      }
      if (!hasCandidateBytes(bytes)) continue;
      const rel = relative(folder, path).split(sep).join('/');
      hits.push(...findHiddenCode(bytes.toString('utf8'), rel));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const FE_B8 = Buffer.from([0xef, 0xb8]);
const F3_A0 = Buffer.from([0xf3, 0xa0]);

/** Native byte search; the portable check is only used for tiny buffers. */
function hasCandidateBytes(bytes: Buffer): boolean {
  if (bytes.length < 64) return mayContainHiddenCode(bytes);
  return bytes.indexOf(FE_B8) !== -1 || bytes.indexOf(F3_A0) !== -1;
}
