import { rank } from './analyze';
import type { ExtensionReport, FindingKind, ScanReport } from './types';

export const FINDING_INFO: Record<FindingKind, { title: string; blurb: string }> = {
  malicious: {
    title: 'Malicious',
    blurb:
      'Removed by Microsoft as malware, or on the list VS Code force-uninstalls. Remove it and rotate any credentials the editor could reach.',
  },
  'hidden-code': {
    title: 'Hidden code',
    blurb:
      'Long runs of invisible Unicode characters in the extension’s JavaScript, the trick GlassWorm used to hide its payload.',
  },
  removed: {
    title: 'Removed',
    blurb:
      'Pulled from the VS Code Marketplace for impersonation, typo-squatting, spam or untrustworthy behaviour.',
  },
  'not-found': {
    title: 'Not in registry',
    blurb:
      'This version is not on the Marketplace or Open VSX: sideloaded from a VSIX, unpublished, or a private build.',
  },
  fresh: {
    title: 'Fresh',
    blurb: 'Published inside your cooldown window, before many bad releases are noticed.',
  },
  'low-reputation': {
    title: 'Low reputation',
    blurb: `Unverified publisher with very few installs.`,
  },
  deprecated: {
    title: 'Deprecated',
    blurb: 'Deprecated, or withdrawn by its owner. Often there is a maintained replacement.',
  },
};

export const FINDING_ORDER: FindingKind[] = [
  'malicious',
  'hidden-code',
  'removed',
  'not-found',
  'fresh',
  'low-reputation',
  'deprecated',
];

export const FAIL_ON_VALUES = [...FINDING_ORDER, 'none'] as const;

export function parseFailOn(value: string): FindingKind[] {
  const out: FindingKind[] = [];
  for (const raw of value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)) {
    if (raw === 'none') continue;
    if (!(FINDING_ORDER as string[]).includes(raw)) {
      throw new Error(`Unknown --fail-on value "${raw}". Use: ${FAIL_ON_VALUES.join(', ')}`);
    }
    out.push(raw as FindingKind);
  }
  return out;
}

export function violations(report: ScanReport, rules: readonly FindingKind[]): ExtensionReport[] {
  return report.extensions.filter((e) => e.flags.some((f) => rules.includes(f)));
}

export function formatAge(days: number | undefined): string {
  if (days === undefined) return '?';
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))}m`;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 60) return `${Math.floor(days)}d`;
  if (days < 730) return `${Math.floor(days / 30.44)}mo`;
  return `${Math.floor(days / 365.25)}y`;
}

/** Short, human description of why an extension is flagged. */
export function describe(ext: ExtensionReport): string[] {
  const out: string[] = [];
  if (ext.removal) {
    out.push(`removed from the Marketplace on ${ext.removal.date} (${ext.removal.type})`);
  }
  if (ext.killSwitch) out.push('on VS Code’s malicious-extension kill list');
  for (const hit of ext.hidden.slice(0, 3)) {
    out.push(`${hit.length} invisible ${hit.kind.replace('-', ' ')} at ${hit.file}:${hit.line}`);
  }
  if (ext.hidden.length > 3) out.push(`…and ${ext.hidden.length - 3} more hidden-code runs`);
  if (ext.flags.includes('not-found')) {
    out.push(
      ext.registry?.found
        ? `version ${ext.version} is not on ${registryName(ext.registry.registry)} (latest ${ext.registry.latestVersion ?? '?'})`
        : `not on ${registryName(ext.registry?.registry ?? 'marketplace')}${ext.source === 'vsix' ? ' (installed from a VSIX)' : ''}`,
    );
  }
  if (ext.flags.includes('fresh')) out.push(`published ${formatAge(ext.ageDays)} ago`);
  if (ext.flags.includes('low-reputation')) {
    out.push(`unverified publisher, ${ext.registry?.installs ?? 0} installs`);
  }
  if (ext.deprecation) {
    out.push(
      ext.deprecation.replacementId
        ? `deprecated, use ${ext.deprecation.replacementName ?? ext.deprecation.replacementId} (${ext.deprecation.replacementId})`
        : 'deprecated',
    );
  }
  return out;
}

export function registryName(registry: string): string {
  return registry === 'openvsx' ? 'Open VSX' : 'the VS Code Marketplace';
}

export function toMarkdown(report: ScanReport): string {
  const s = report.summary;
  const lines: string[] = ['## vsxguard report', ''];
  if (s.malicious || s.hiddenCode) {
    lines.push(`🚨 **${s.malicious + s.hiddenCode} extension(s) need removing now.**`, '');
  } else if (report.errors.length) {
    lines.push('⚠️ **Scan incomplete.**', '');
  } else {
    lines.push('✅ **No known-malicious extensions or hidden payloads.**', '');
  }
  lines.push(
    `Scanned ${s.total} extensions in ${report.editors.map((e) => e.label).join(', ') || 'no editors'}.`,
    '',
  );
  lines.push('| Check | Extensions |', '| --- | ---: |');
  for (const kind of FINDING_ORDER) {
    const n = report.extensions.filter((e) => e.flags.includes(kind)).length;
    lines.push(`| ${FINDING_INFO[kind].title} | ${n} |`);
  }
  lines.push('');
  const flagged = rank(report.extensions.filter((e) => e.flags.length));
  if (flagged.length) {
    lines.push('| Extension | Version | Editors | Findings |', '| --- | --- | --- | --- |');
    for (const e of flagged) {
      lines.push(
        `| \`${e.id}\` | ${e.version} | ${e.editors.join(', ')} | ${describe(e).join('; ')} |`,
      );
    }
    lines.push('');
  }
  for (const n of [...report.errors, ...report.notes]) lines.push(`> ${n}`);
  lines.push(
    '',
    `<sub>[vsxguard](https://github.com/feresbr1/vsxguard) ${report.tool.version} · Microsoft removal list as of ${report.data.removedAsOf.slice(0, 10)} (${report.data.removedCount} entries) · kill list as of ${report.data.killSwitchAsOf.slice(0, 10)}</sub>`,
  );
  return lines.join('\n');
}
