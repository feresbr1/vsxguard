import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_COOLDOWN_DAYS, rank } from '../core/analyze';
import {
  describe,
  FAIL_ON_VALUES,
  FINDING_INFO,
  FINDING_ORDER,
  parseFailOn,
  toMarkdown,
  violations,
} from '../core/report';
import type { ExtensionReport, FindingKind, ScanReport } from '../core/types';
import { VERSION } from '../core/version';
import { EDITORS } from '../node/discover';
import { runScan } from '../node/run';

const DEFAULT_FAIL_ON = 'malicious,hidden-code';

const HELP = `vsxguard ${VERSION}
Check the extensions installed in VS Code, Cursor, Windsurf, VSCodium and other
VS Code-based editors against Microsoft's removed-extension and kill lists, look for
GlassWorm-style hidden code, and flag fresh, unlisted or deprecated versions.

Usage
  vsxguard [options]

Options
  -c, --cooldown <days>        Flag versions published fewer than this many days ago (default ${DEFAULT_COOLDOWN_DAYS})
  -f, --fail-on <checks>       Exit 1 when an extension matches (default "${DEFAULT_FAIL_ON}")
                               ${FAIL_ON_VALUES.join(', ')}
  -e, --editor <ids>           Only these editors, comma-separated (see below)
  -d, --extensions-dir <path>  Also scan this extensions folder (repeatable)
      --offline                Use the bundled lists only; skip registry lookups
      --no-scan                Skip the hidden-code file scan
  -a, --all                    List every extension, not only flagged ones
      --json                   Print the full report as JSON
      --markdown               Print a Markdown summary
      --markdown-file <path>   Also append the Markdown summary to a file
      --allow-incomplete       Exit 0/1 even if a registry could not be reached
      --no-color               Disable colours (NO_COLOR is also respected)
  -v, --version                Print the version
  -h, --help                   Show this help

Editors
  ${EDITORS.map((e) => `${e.id} (~/${e.dir})`).join('\n  ')}

Exit codes
  0  nothing matched --fail-on
  1  at least one extension matched --fail-on
  2  usage error, no editors found, or incomplete scan

Examples
  npx github:feresbr1/vsxguard
  npx github:feresbr1/vsxguard --editor cursor,windsurf --all
  npx github:feresbr1/vsxguard --fail-on malicious,hidden-code,removed --json
`;

export async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        cooldown: { type: 'string', short: 'c' },
        'fail-on': { type: 'string', short: 'f' },
        editor: { type: 'string', short: 'e', multiple: true },
        'extensions-dir': { type: 'string', short: 'd', multiple: true },
        offline: { type: 'boolean' },
        'no-scan': { type: 'boolean' },
        all: { type: 'boolean', short: 'a' },
        json: { type: 'boolean' },
        markdown: { type: 'boolean' },
        'markdown-file': { type: 'string' },
        'allow-incomplete': { type: 'boolean' },
        'no-color': { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    process.stderr.write(`vsxguard: ${(error as Error).message}\nRun vsxguard --help for usage.\n`);
    return 2;
  }
  const { values } = args;
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const c = palette(!values['no-color'] && !process.env.NO_COLOR && Boolean(process.stdout.isTTY));
  const fail = (message: string) => {
    process.stderr.write(`${c.red('vsxguard:')} ${message}\n`);
    return 2;
  };

  const cooldown = values.cooldown === undefined ? DEFAULT_COOLDOWN_DAYS : Number(values.cooldown);
  if (!Number.isFinite(cooldown) || cooldown < 0) {
    return fail(`--cooldown must be a number of days, got "${values.cooldown}".`);
  }
  const failOnText = values['fail-on'] ?? DEFAULT_FAIL_ON;
  let rules: FindingKind[];
  try {
    rules = parseFailOn(failOnText);
  } catch (error) {
    return fail((error as Error).message);
  }
  const only = (values.editor ?? [])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  const unknownEditor = only.find((id) => !EDITORS.some((e) => e.id === id));
  if (unknownEditor) {
    return fail(`Unknown editor "${unknownEditor}". Known: ${EDITORS.map((e) => e.id).join(', ')}`);
  }

  const quiet = values.json || values.markdown || !process.stderr.isTTY;
  let report: ScanReport;
  try {
    report = await runScan({
      extensionsDirs: values['extensions-dir'],
      only,
      cooldownDays: cooldown,
      offline: values.offline,
      scanFiles: !values['no-scan'],
      onStage: quiet ? undefined : (m) => process.stderr.write(c.dim(`${m}…\n`)),
    });
  } catch (error) {
    return fail((error as Error).message);
  }

  if (report.editors.length === 0) {
    return fail(
      `No editor extension folders found${only.length ? ` for ${only.join(', ')}` : ''}. Looked in ~/${EDITORS.map((e) => e.dir).join(', ~/')}. Use --extensions-dir <path> for other locations.`,
    );
  }

  const failing = violations(report, rules);
  if (values['markdown-file']) {
    try {
      appendFileSync(values['markdown-file'], `${toMarkdown(report)}\n`);
    } catch (error) {
      return fail(`Cannot write ${values['markdown-file']}: ${(error as Error).message}`);
    }
  }

  if (values.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else if (values.markdown) process.stdout.write(`${toMarkdown(report)}\n`);
  else process.stdout.write(renderText(report, failing, Boolean(values.all), c, failOnText));

  if (report.errors.length && !values['allow-incomplete']) return 2;
  return failing.length ? 1 : 0;
}

type Paint = (s: string) => string;
interface Palette {
  red: Paint;
  orange: Paint;
  yellow: Paint;
  green: Paint;
  violet: Paint;
  blue: Paint;
  dim: Paint;
  bold: Paint;
}

function palette(enabled: boolean): Palette {
  const wrap = (open: string, close = '\x1b[39m'): Paint =>
    enabled ? (s) => `${open}${s}${close}` : (s) => s;
  return {
    red: wrap('\x1b[31m'),
    orange: wrap('\x1b[38;5;208m'),
    yellow: wrap('\x1b[33m'),
    green: wrap('\x1b[32m'),
    violet: wrap('\x1b[35m'),
    blue: wrap('\x1b[34m'),
    dim: wrap('\x1b[2m', '\x1b[22m'),
    bold: wrap('\x1b[1m', '\x1b[22m'),
  };
}

function paintFor(kind: FindingKind, c: Palette): Paint {
  switch (kind) {
    case 'malicious':
    case 'hidden-code':
      return c.red;
    case 'removed':
      return c.orange;
    case 'not-found':
      return c.violet;
    case 'fresh':
      return c.yellow;
    case 'low-reputation':
      return c.blue;
    default:
      return c.dim;
  }
}

function renderText(
  report: ScanReport,
  failing: ExtensionReport[],
  all: boolean,
  c: Palette,
  failOn: string,
): string {
  const s = report.summary;
  const out: string[] = [''];
  out.push(c.dim(report.editors.map((e) => `${e.label} (${e.count})`).join(' · ')));
  const urgent = report.extensions.filter(
    (e) => e.flags.includes('malicious') || e.flags.includes('hidden-code'),
  ).length;
  if (urgent) {
    out.push(c.bold(c.red(`✖ ${urgent} extension${urgent > 1 ? 's' : ''} to remove now`)));
  } else if (report.errors.length) {
    out.push(c.bold(c.yellow('! Scan incomplete')));
  } else {
    out.push(c.bold(c.green(`✔ No known-malicious extensions in ${s.total} installed`)));
  }
  out.push('');
  for (const kind of FINDING_ORDER) {
    const n = report.extensions.filter((e) => e.flags.includes(kind)).length;
    const label =
      kind === 'fresh'
        ? `fresh (<${report.cooldownDays}d)`
        : FINDING_INFO[kind].title.toLowerCase();
    out.push(`  ${label.padEnd(16)}${n ? paintFor(kind, c)(String(n)) : c.dim('0')}`);
  }
  out.push('');

  const shown = rank(all ? report.extensions : report.extensions.filter((e) => e.flags.length));
  for (const ext of shown) {
    const marker = failing.includes(ext) ? c.red('✖') : ' ';
    const tags = ext.flags.map((f) => paintFor(f, c)(FINDING_INFO[f].title.toLowerCase()));
    out.push(
      ` ${marker} ${ext.id}@${ext.version}  ${tags.join(c.dim(' · ')) || c.dim('ok')}  ${c.dim(ext.editors.join(', '))}`,
    );
    for (const line of describe(ext)) out.push(c.dim(`      ${line}`));
  }
  if (shown.length) out.push('');

  for (const e of report.errors) out.push(c.yellow(`! ${e}`));
  for (const n of report.notes) out.push(c.dim(`note: ${n}`));
  out.push(
    c.dim(
      `Microsoft removal list: ${report.data.removedCount} entries (as of ${report.data.removedAsOf.slice(0, 10)}) · kill list: ${report.data.killSwitchCount} (as of ${report.data.killSwitchAsOf.slice(0, 10)})`,
    ),
  );
  out.push(
    failing.length
      ? c.red(
          `${failing.length} extension${failing.length > 1 ? 's' : ''} matched --fail-on ${failOn}`,
        )
      : c.dim(`Nothing matched --fail-on ${failOn}.`),
  );
  out.push('');
  return out.join('\n');
}
