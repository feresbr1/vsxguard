import { useMemo, useState } from 'preact/hooks';
import { evaluate, rank, summarize } from '../../core/analyze';
import { isMaliciousRemoval } from '../../core/lists';
import { parseExtensionList } from '../../core/paste';
import { lookupOpenVsx } from '../../core/registries';
import { describe, FINDING_INFO } from '../../core/report';
import type { ExtensionReport, KnownBad } from '../../core/types';
import { toneStyle } from '../tones';
import { CopyButton } from './CopyButton';

const COMMANDS = [
  { label: 'VS Code', cmd: 'code --list-extensions --show-versions' },
  { label: 'Cursor', cmd: 'cursor --list-extensions --show-versions' },
  { label: 'Windsurf', cmd: 'windsurf --list-extensions --show-versions' },
  { label: 'VSCodium', cmd: 'codium --list-extensions --show-versions' },
];

interface CheckerProps {
  knownBad: KnownBad;
  cooldownDays: number;
}

type Result =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'done'; reports: ExtensionReport[]; rejected: string[]; note?: string };

export function Checker({ knownBad, cooldownDays }: CheckerProps) {
  const [tab, setTab] = useState(0);
  const [text, setText] = useState('');
  const [useOpenVsx, setUseOpenVsx] = useState(true);
  const [result, setResult] = useState<Result>({ state: 'idle' });
  const [error, setError] = useState<string>();

  const sample = useMemo(() => sampleList(knownBad), [knownBad]);

  const check = async (input: string) => {
    setError(undefined);
    const parsed = parseExtensionList(input);
    if (!parsed.extensions.length) {
      setResult({ state: 'idle' });
      setError(
        'No extension ids found. Paste one "publisher.name@version" per line, as printed by the command above.',
      );
      return;
    }
    setResult({ state: 'checking' });
    let note: string | undefined;
    let registry;
    // Removed or killed extensions are gone from registries; looking them up only adds 404s.
    const withVersions = parsed.extensions.filter((e) => {
      const id = e.id.toLowerCase();
      return e.version && !knownBad.removed.has(id) && !knownBad.malicious.has(id);
    });
    if (useOpenVsx && withVersions.length) {
      try {
        registry = await lookupOpenVsx(withVersions, (url, init) => fetch(url, init));
        // In the browser only Open VSX is reachable, so a miss there proves nothing for
        // VS Code users (who install from the Marketplace). Keep only positive matches.
        for (const [key, info] of registry) if (!info.versionFound) registry.delete(key);
      } catch {
        note = 'Open VSX could not be reached, so publish dates were not checked.';
      }
    }
    const reports = rank(evaluate(parsed.extensions, { knownBad, registry, cooldownDays }));
    setResult({ state: 'done', reports, rejected: parsed.rejected, note });
  };

  return (
    <section class="section wrap" id="check" aria-labelledby="check-title">
      <h2 id="check-title">Check a list in your browser</h2>
      <p class="section-sub">
        Run this in a terminal, paste the output below, and it is checked against Microsoft's
        removal and kill lists. Nothing is uploaded: only the ids are compared, in this tab. The CLI
        does more (it scans every editor and looks for hidden code), but this needs no install.
      </p>
      <div class="card">
        <div class="tabs" role="tablist" aria-label="Editor">
          {COMMANDS.map((c, i) => (
            <button
              type="button"
              role="tab"
              key={c.label}
              aria-selected={tab === i}
              onClick={() => setTab(i)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div class="hint" role="tabpanel">
          <code>{COMMANDS[tab]!.cmd}</code>
          <CopyButton text={COMMANDS[tab]!.cmd} />
        </div>
        <label class="sr-only" for="ext-list">
          Extension list
        </label>
        <textarea
          id="ext-list"
          placeholder={'esbenp.prettier-vscode@12.4.0\nms-python.python@2026.4.0\n…'}
          value={text}
          spellcheck={false}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <div class="row">
          <label class="check-label">
            <input
              type="checkbox"
              checked={useOpenVsx}
              onChange={(e) => setUseOpenVsx(e.currentTarget.checked)}
            />
            Also look up publish dates on Open VSX
          </label>
          <span class="row" style={{ marginTop: 0 }}>
            <button
              type="button"
              class="linkish"
              onClick={() => {
                setText(sample);
                void check(sample);
              }}
            >
              Try a sample list
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={!text.trim() || result.state === 'checking'}
              onClick={() => void check(text)}
            >
              {result.state === 'checking' ? 'Checking…' : 'Check extensions'}
            </button>
          </span>
        </div>
        {error && (
          <p class="alert is-error" role="alert">
            {error}
          </p>
        )}
        {result.state === 'done' && <Results result={result} />}
      </div>
    </section>
  );
}

function Results({ result }: { result: Extract<Result, { state: 'done' }> }) {
  const s = summarize(result.reports);
  const urgent = s.malicious + s.hiddenCode;
  const flagged = result.reports.filter((r) => r.flags.length);
  const tone = urgent ? 'bad' : s.removed ? 'warn' : 'good';
  const title = urgent
    ? `${urgent} malicious extension${urgent > 1 ? 's' : ''}: uninstall now`
    : s.removed
      ? `${s.removed} extension${s.removed > 1 ? 's' : ''} removed from the Marketplace`
      : `None of these ${s.total} extensions are on Microsoft's removal or kill lists`;
  return (
    <div aria-live="polite">
      <h3 class="verdict" data-tone={tone} data-testid="verdict">
        {title}
      </h3>
      {urgent > 0 && (
        <p class="section-sub" style={{ marginBottom: 0 }}>
          Uninstall {urgent > 1 ? 'them' : 'it'}, restart the editor, and rotate any tokens or keys
          the editor could read (git credentials, cloud CLIs, .env files), from a clean machine if
          possible.
        </p>
      )}
      {result.note && <p class="alert">{result.note}</p>}
      <ul class="results">
        {(flagged.length ? flagged : result.reports).map((r) => (
          <li class="result" key={r.key} data-testid="result">
            <span class="result-id">
              {r.id}
              {r.version && <span class="ver">@{r.version}</span>}
            </span>
            <span class="chips">
              {r.flags.length === 0 && <span class="muted">ok</span>}
              {r.flags.map((f) => (
                <span class="chip" key={f} style={toneStyle(f)}>
                  {FINDING_INFO[f].title}
                </span>
              ))}
            </span>
            {r.flags.length > 0 && (
              <ul class="result-notes">
                {describe(r).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {flagged.length > 0 && flagged.length < result.reports.length && (
        <p class="hero-sub">
          {result.reports.length - flagged.length} other extension
          {result.reports.length - flagged.length > 1 ? 's' : ''} had no findings.
        </p>
      )}
      {result.rejected.length > 0 && (
        <p class="hero-sub">
          Ignored {result.rejected.length} line{result.rejected.length > 1 ? 's' : ''} that were not
          extension ids.
        </p>
      )}
    </div>
  );
}

/** A realistic list: popular extensions plus real entries from Microsoft's removal list. */
function sampleList(knownBad: KnownBad): string {
  const removed = [...knownBad.removed.entries()];
  const malware = removed.find(([, r]) => isMaliciousRemoval(r))?.[0];
  const impersonation = removed.find(([, r]) => /impersonation/i.test(r.type))?.[0];
  return [
    'esbenp.prettier-vscode@12.4.0',
    'dbaeumer.vscode-eslint@3.0.16',
    malware,
    'eamodio.gitlens@2026.10.170513',
    impersonation,
    'ms-python.python@2026.4.0',
  ]
    .filter(Boolean)
    .join('\n');
}
