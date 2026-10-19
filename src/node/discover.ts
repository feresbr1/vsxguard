import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EditorId, InstalledExtension } from '../core/types';

export interface EditorLocation {
  id: EditorId;
  label: string;
  /** Extensions folder relative to the home directory. */
  dir: string;
}

/** Where each editor keeps user-installed extensions (same layout on macOS, Linux and Windows). */
export const EDITORS: EditorLocation[] = [
  { id: 'vscode', label: 'VS Code', dir: '.vscode/extensions' },
  { id: 'vscode-insiders', label: 'VS Code Insiders', dir: '.vscode-insiders/extensions' },
  { id: 'vscodium', label: 'VSCodium', dir: '.vscode-oss/extensions' },
  { id: 'cursor', label: 'Cursor', dir: '.cursor/extensions' },
  { id: 'windsurf', label: 'Windsurf', dir: '.windsurf/extensions' },
  { id: 'positron', label: 'Positron', dir: '.positron/extensions' },
  { id: 'kiro', label: 'Kiro', dir: '.kiro/extensions' },
  { id: 'trae', label: 'Trae', dir: '.trae/extensions' },
  { id: 'antigravity', label: 'Antigravity', dir: '.antigravity/extensions' },
  { id: 'void', label: 'Void', dir: '.void-editor/extensions' },
  { id: 'vscode-server', label: 'VS Code Server', dir: '.vscode-server/extensions' },
  {
    id: 'vscode-server-insiders',
    label: 'VS Code Server Insiders',
    dir: '.vscode-server-insiders/extensions',
  },
  { id: 'cursor-server', label: 'Cursor Server', dir: '.cursor-server/extensions' },
  { id: 'windsurf-server', label: 'Windsurf Server', dir: '.windsurf-server/extensions' },
  { id: 'vscodium-server', label: 'VSCodium Server', dir: '.vscodium-server/extensions' },
];

export interface FoundEditor {
  id: EditorId;
  label: string;
  path: string;
}

/** Editors whose extensions folder exists. Extra folders (--extensions-dir) are added as "custom". */
export function findEditors(home = homedir(), extraDirs: string[] = []): FoundEditor[] {
  const found: FoundEditor[] = [];
  for (const editor of EDITORS) {
    const path = join(home, editor.dir);
    if (isDir(path)) found.push({ id: editor.id, label: editor.label, path });
  }
  for (const path of extraDirs) {
    if (!isDir(path)) throw new Error(`Not a directory: ${path}`);
    found.push({ id: 'custom', label: path, path });
  }
  return found;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

interface ExtensionsJsonEntry {
  identifier?: { id?: string };
  version?: string;
  relativeLocation?: string;
  metadata?: { source?: string; installedTimestamp?: number; isPreReleaseVersion?: boolean };
}

/**
 * Extensions installed in one folder. Each extension is a sub-folder with a package.json;
 * extensions.json adds install metadata, and .obsolete lists folders VS Code will delete
 * on next start (they are skipped).
 */
export function readExtensionsDir(dir: string, editor: EditorId): InstalledExtension[] {
  const meta = new Map<string, ExtensionsJsonEntry>();
  const listing = readJson<ExtensionsJsonEntry[]>(join(dir, 'extensions.json'));
  if (Array.isArray(listing)) {
    for (const entry of listing) {
      if (entry.relativeLocation) meta.set(entry.relativeLocation.toLowerCase(), entry);
    }
  }
  const obsolete = readJson<Record<string, boolean>>(join(dir, '.obsolete')) ?? {};
  const obsoleteSet = new Set(Object.keys(obsolete).map((k) => k.toLowerCase()));

  const out: InstalledExtension[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith('.') || obsoleteSet.has(name.toLowerCase())) continue;
    const folder = join(dir, name);
    const pkg = readJson<{
      publisher?: string;
      name?: string;
      version?: string;
      displayName?: string;
    }>(join(folder, 'package.json'));
    if (!pkg?.publisher || !pkg.name || !pkg.version) continue;
    const info = meta.get(name.toLowerCase());
    const ts = info?.metadata?.installedTimestamp;
    out.push({
      id: `${pkg.publisher}.${pkg.name}`,
      version: pkg.version,
      displayName:
        pkg.displayName && !pkg.displayName.startsWith('%') ? pkg.displayName : undefined,
      editors: [editor],
      paths: [folder],
      source:
        info?.metadata?.source === 'gallery'
          ? 'gallery'
          : info?.metadata?.source === 'vsix'
            ? 'vsix'
            : 'unknown',
      installedAt: typeof ts === 'number' ? new Date(ts).toISOString() : undefined,
      preRelease: info?.metadata?.isPreReleaseVersion,
    });
  }
  return out;
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(stripBom(readFileSync(path, 'utf8'))) as T;
  } catch {
    return undefined;
  }
}

/** Merge the same id@version installed in several editors into one entry. */
export function mergeInstalled(lists: InstalledExtension[][]): InstalledExtension[] {
  const byKey = new Map<string, InstalledExtension>();
  for (const ext of lists.flat()) {
    const key = `${ext.id.toLowerCase()}@${ext.version}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...ext, editors: [...ext.editors], paths: [...ext.paths] });
      continue;
    }
    for (const e of ext.editors) if (!prev.editors.includes(e)) prev.editors.push(e);
    for (const p of ext.paths) if (!prev.paths.includes(p)) prev.paths.push(p);
    if (prev.source !== 'vsix' && ext.source === 'vsix') prev.source = 'vsix';
  }
  return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
