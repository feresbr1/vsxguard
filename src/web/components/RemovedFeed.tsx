import { useMemo, useState } from 'preact/hooks';
import { REMOVED_LIST_PAGE } from '../../core/lists';
import type { KnownBad } from '../../core/types';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'malware', label: 'Malware', test: (t: string) => /malware|malicious/i.test(t) },
  {
    id: 'impersonation',
    label: 'Impersonation',
    test: (t: string) => /impersonation|typo/i.test(t),
  },
  { id: 'untrustworthy', label: 'Untrustworthy', test: (t: string) => /untrustworthy/i.test(t) },
  { id: 'spam', label: 'Spam', test: (t: string) => /spam/i.test(t) },
] as const;

const PAGE = 50;

export function RemovedFeed({ knownBad }: { knownBad: KnownBad }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [limit, setLimit] = useState(PAGE);

  const all = useMemo(
    () =>
      [...knownBad.removed.entries()]
        .map(([id, r]) => ({ id, ...r, killSwitch: knownBad.malicious.has(id) }))
        .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    [knownBad],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return all.filter((r) => test(r.type) && (!q || r.id.includes(q)));
  }, [all, query, filter]);

  return (
    <section class="section wrap" id="removed" aria-labelledby="removed-title">
      <h2 id="removed-title">Removed from the VS Code Marketplace</h2>
      <p class="section-sub">
        Every extension Microsoft has publicly listed as removed, newest first, from{' '}
        <a href={REMOVED_LIST_PAGE}>microsoft/vsmarketplace</a>. Search for any extension id.
        Entries marked <b>kill list</b> are the ones VS Code also uninstalls automatically.
      </p>
      <div class="toolbar">
        <label class="sr-only" for="removed-search">
          Search removed extensions
        </label>
        <input
          id="removed-search"
          class="search"
          type="search"
          placeholder="publisher.extension…"
          value={query}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setLimit(PAGE);
          }}
        />
        <div class="filters" role="group" aria-label="Removal reason">
          {FILTERS.map((f) => (
            <button
              type="button"
              key={f.id}
              class="filter"
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setLimit(PAGE);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p class="hero-sub" aria-live="polite" style={{ marginTop: 0, marginBottom: '10px' }}>
        {rows.length.toLocaleString('en-US')} of {all.length.toLocaleString('en-US')} removals
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Extension</th>
              <th scope="col">Removed</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} class="muted" style={{ textAlign: 'center', padding: '28px' }}>
                  {query
                    ? `“${query}” is not on Microsoft's removal list.`
                    : 'No removals of this type.'}
                </td>
              </tr>
            )}
            {rows.slice(0, limit).map((r) => (
              <tr key={r.id} data-testid="removed-row">
                <td class="id">{r.id}</td>
                <td class="mono">{r.date}</td>
                <td>
                  {r.type}
                  {r.killSwitch && <span class="cli-only">kill list</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div class="more">
          <button type="button" class="btn" onClick={() => setLimit(limit + PAGE * 4)}>
            Show more ({(rows.length - limit).toLocaleString('en-US')} left)
          </button>
        </div>
      )}
    </section>
  );
}
