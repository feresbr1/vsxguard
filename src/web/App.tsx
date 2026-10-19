import { useEffect, useMemo, useState } from 'preact/hooks';
import snapshotJson from '../../data/lists-snapshot.json';
import { DEFAULT_COOLDOWN_DAYS } from '../core/analyze';
import {
  isMaliciousRemoval,
  knownBadFromSnapshot,
  loadKnownBad,
  type ListsSnapshot,
} from '../core/lists';
import { FINDING_INFO, FINDING_ORDER } from '../core/report';
import type { KnownBad } from '../core/types';
import { VERSION } from '../core/version';
import { Checker } from './components/Checker';
import { CopyButton } from './components/CopyButton';
import { GitHubIcon, Logo, ThemeIcon } from './components/Icons';
import { RemovedFeed } from './components/RemovedFeed';
import { storage } from './storage';
import { FINDING_TONE } from './tones';

const SNAPSHOT = snapshotJson as ListsSnapshot;
const REPO = 'https://github.com/feresbr1/vsxguard';
const COMMAND = 'npx github:feresbr1/vsxguard';
const CLI_ONLY = new Set(['hidden-code', 'not-found', 'low-reputation']);

export function App() {
  // Render instantly from the bundled snapshot, then swap in the live removal list.
  const [knownBad, setKnownBad] = useState<KnownBad>(() => knownBadFromSnapshot(SNAPSHOT));
  const [live, setLive] = useState<'loading' | 'live' | 'snapshot'>('loading');
  const [theme, setTheme] = useState(() => storage.get('theme') ?? undefined);

  useEffect(() => {
    loadKnownBad((url, init) => fetch(url, init), SNAPSHOT, { skipKillSwitch: true }).then(
      (kb) => {
        // The kill list is not CORS-readable, so it always comes from the snapshot here.
        kb.killSwitchAsOf = SNAPSHOT.fetchedAt;
        setKnownBad(kb);
        setLive(kb.fromSnapshot.includes('removed') ? 'snapshot' : 'live');
      },
      () => setLive('snapshot'),
    );
  }, []);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  const toggleTheme = () => {
    const dark = theme
      ? theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    storage.set('theme', next);
  };

  const stats = useMemo(() => {
    const removals = [...knownBad.removed.values()];
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return {
      total: removals.length,
      malware: removals.filter(isMaliciousRemoval).length,
      recent: removals.filter((r) => r.date >= cutoff).length,
      kill: knownBad.malicious.size,
    };
  }, [knownBad]);

  return (
    <>
      <a class="sr-only" href="#main">
        Skip to content
      </a>
      <header class="site-header">
        <div class="wrap">
          <a class="brand" href="./">
            <Logo />
            vsxguard
          </a>
          <nav class="nav" aria-label="Site">
            <a class="hide-sm" href="#check">
              Check a list
            </a>
            <a class="hide-sm" href="#removed">
              Removed list
            </a>
            <button type="button" onClick={toggleTheme} aria-label="Toggle dark mode">
              <ThemeIcon />
            </button>
            <a href={REPO} aria-label="vsxguard on GitHub">
              <GitHubIcon />
              <span class="hide-sm">GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section class="hero wrap">
          <p class="eyebrow">
            VS Code · Cursor · Windsurf · VSCodium · Positron · Kiro · Antigravity
          </p>
          <h1>
            Microsoft has pulled{' '}
            <span class="num" data-testid="removed-count">
              {stats.total.toLocaleString('en-US')}
            </span>{' '}
            extensions from the Marketplace. Is one still installed?
          </h1>
          <p class="lede">
            Removing an extension from the Marketplace does not remove it from your editor. VS Code
            force-uninstalls only the {stats.kill} on its kill list; editors that install from Open
            VSX, like Cursor, Windsurf and VSCodium, use a different registry. vsxguard checks every
            editor on your machine in seconds, and looks for the invisible-Unicode trick GlassWorm
            used to hide its payload.
          </p>
          <div class="cmd">
            <span class="prompt">$</span>
            <code>{COMMAND}</code>
            <CopyButton text={COMMAND} class="btn btn-primary" />
          </div>
          <p class="hero-sub">
            Node.js 18+, no install, nothing uploaded. Or{' '}
            <a href="#check">check a list in your browser</a>.
          </p>
        </section>

        <div class="wrap">
          <div class="stats" aria-label="Removal list statistics">
            <div class="stat">
              <b>{stats.total.toLocaleString('en-US')}</b>
              <span>extensions removed</span>
            </div>
            <div class="stat">
              <b style={{ color: 'var(--red)' }}>{stats.malware.toLocaleString('en-US')}</b>
              <span>removed as malware</span>
            </div>
            <div class="stat">
              <b>{stats.recent}</b>
              <span>removed in the last 30 days</span>
            </div>
            <div class="stat">
              <b>{stats.kill}</b>
              <span>auto-uninstalled by VS Code</span>
            </div>
          </div>
        </div>

        <Checker knownBad={knownBad} cooldownDays={DEFAULT_COOLDOWN_DAYS} />

        <section class="section wrap" aria-labelledby="checks-title">
          <h2 id="checks-title">What vsxguard checks</h2>
          <p class="section-sub">
            The CLI runs every check against each extension folder it finds under your home
            directory, including VS Code Server and Cursor Server installs on remote machines.
          </p>
          <div class="checks">
            {FINDING_ORDER.map((kind) => (
              <div class="check" key={kind}>
                <h3>
                  <span class="dot" style={{ background: FINDING_TONE[kind].fg }} />
                  {FINDING_INFO[kind].title}
                  {CLI_ONLY.has(kind) && <span class="cli-only">CLI</span>}
                </h3>
                <p>{FINDING_INFO[kind].blurb}</p>
              </div>
            ))}
          </div>
        </section>

        <RemovedFeed knownBad={knownBad} />
      </main>

      <footer class="site-footer">
        <div class="wrap">
          <span>
            vsxguard v{VERSION} · MIT · <a href={`${REPO}/issues`}>report an issue</a>
          </span>
          <span data-testid="data-status">
            Removal list{' '}
            {live === 'live'
              ? 'loaded live from GitHub'
              : live === 'loading'
                ? 'loading…'
                : `from snapshot (${SNAPSHOT.fetchedAt.slice(0, 10)})`}{' '}
            · kill list snapshot {SNAPSHOT.fetchedAt.slice(0, 10)}
          </span>
        </div>
      </footer>
    </>
  );
}
