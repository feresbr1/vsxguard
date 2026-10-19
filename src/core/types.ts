export type EditorId =
  | 'vscode'
  | 'vscode-insiders'
  | 'vscodium'
  | 'cursor'
  | 'windsurf'
  | 'positron'
  | 'kiro'
  | 'trae'
  | 'antigravity'
  | 'void'
  | 'vscode-server'
  | 'vscode-server-insiders'
  | 'cursor-server'
  | 'windsurf-server'
  | 'vscodium-server'
  | 'custom';

export type Registry = 'marketplace' | 'openvsx';

/** One installed extension version. */
export interface InstalledExtension {
  /** "publisher.name" as declared by the extension (case preserved). */
  id: string;
  version: string;
  displayName?: string;
  /** Editors (or extension folders) this version is installed in. */
  editors: EditorId[];
  /** Folders on disk, one per editor it is installed in (empty for pasted lists). */
  paths: string[];
  /** How it was installed, from extensions.json. */
  source?: 'gallery' | 'vsix' | 'unknown';
  installedAt?: string;
  preRelease?: boolean;
}

export interface Removal {
  /** Microsoft's removal reason, e.g. "Malware", "Impersonation", "Untrustworthy". */
  type: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
}

export interface Deprecation {
  replacementId?: string;
  replacementName?: string;
  disallowInstall?: boolean;
}

/** Microsoft's published lists, keyed by lower-case extension id. */
export interface KnownBad {
  removed: Map<string, Removal>;
  /** VS Code's kill-switch list: extensions VS Code uninstalls automatically. */
  malicious: Set<string>;
  deprecated: Map<string, Deprecation>;
  /** When each list was fetched, or the snapshot date if offline. */
  removedAsOf: string;
  killSwitchAsOf: string;
  /** Lists that came from the bundled snapshot because the live copy was unreachable. */
  fromSnapshot: ('removed' | 'kill-switch')[];
}

export interface RegistryInfo {
  registry: Registry;
  /** The extension exists in this registry. */
  found: boolean;
  /** The installed version exists in this registry. */
  versionFound: boolean;
  /** When the installed version was published. */
  publishedAt?: string;
  latestVersion?: string;
  verifiedPublisher?: boolean;
  installs?: number;
}

export interface HiddenCodeHit {
  /** Path relative to the extension folder. */
  file: string;
  line: number;
  kind: 'variation-selectors' | 'tag-characters';
  /** Number of consecutive invisible characters. */
  length: number;
}

export type FindingKind =
  'malicious' | 'removed' | 'hidden-code' | 'not-found' | 'fresh' | 'deprecated' | 'low-reputation';

export interface ExtensionReport extends InstalledExtension {
  /** Lower-case "publisher.name@version". */
  key: string;
  flags: FindingKind[];
  removal?: Removal;
  killSwitch: boolean;
  deprecation?: Deprecation;
  registry?: RegistryInfo;
  ageDays?: number;
  hidden: HiddenCodeHit[];
}

export interface ScanSummary {
  total: number;
  malicious: number;
  removed: number;
  hiddenCode: number;
  notFound: number;
  fresh: number;
  deprecated: number;
  lowReputation: number;
}

export interface ScanReport {
  tool: { name: 'vsxguard'; version: string };
  scannedAt: string;
  cooldownDays: number;
  editors: { id: EditorId; label: string; path: string; count: number }[];
  data: {
    removedAsOf: string;
    killSwitchAsOf: string;
    removedCount: number;
    killSwitchCount: number;
  };
  summary: ScanSummary;
  extensions: ExtensionReport[];
  /** Checks that were skipped or failed; results from them are incomplete. */
  notes: string[];
  errors: string[];
}
