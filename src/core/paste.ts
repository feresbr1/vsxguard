import type { InstalledExtension } from './types';

const ID = /^([A-Za-z0-9][\w-]*\.[A-Za-z0-9][\w.-]*?)(?:@(\d[\w.+-]*))?$/;

export interface PastedList {
  extensions: InstalledExtension[];
  /** Lines that did not look like an extension id. */
  rejected: string[];
}

/**
 * Parse the output of `code --list-extensions --show-versions` (also cursor, windsurf, codium…):
 * one `publisher.name@version` per line. Lines without a version are accepted too, as is the
 * content of an extensions folder's extensions.json.
 */
export function parseExtensionList(text: string): PastedList {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      return fromExtensionsJson(JSON.parse(trimmed));
    } catch {
      // fall through to line parsing
    }
  }
  const byKey = new Map<string, InstalledExtension>();
  const rejected: string[] = [];
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const m = ID.exec(line);
    if (!m) {
      rejected.push(line);
      continue;
    }
    const ext: InstalledExtension = { id: m[1]!, version: m[2] ?? '', editors: [], paths: [] };
    byKey.set(`${ext.id.toLowerCase()}@${ext.version}`, ext);
  }
  return { extensions: [...byKey.values()], rejected };
}

function fromExtensionsJson(data: unknown): PastedList {
  if (!Array.isArray(data)) throw new Error('not an array');
  const extensions: InstalledExtension[] = [];
  for (const entry of data as { identifier?: { id?: string }; version?: string }[]) {
    if (entry?.identifier?.id) {
      extensions.push({
        id: entry.identifier.id,
        version: entry.version ?? '',
        editors: [],
        paths: [],
      });
    }
  }
  if (!extensions.length) throw new Error('no extensions');
  return { extensions, rejected: [] };
}
