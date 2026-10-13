// Turns per-project count results into data/stats.json and data/history.json rows.

export function dateInToronto(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(date);
}

// results: { [name]: { ok: true, loc, since_sdcv, last_commit } | { ok: false, error } }
// A failed project keeps its previous numbers and is marked stale from the first failed day.
export function buildStats(config, results, previous, now) {
  const today = dateInToronto(now);
  const prevByName = new Map((previous?.projects ?? []).map((p) => [p.name, p]));
  const projects = config.projects.map(({ name }) => {
    const r = results[name];
    if (r?.ok) {
      return { name, loc: r.loc, since_sdcv: r.since_sdcv, last_commit: r.last_commit, stale_since: null };
    }
    const prev = prevByName.get(name);
    return {
      name,
      loc: prev?.loc ?? 0,
      since_sdcv: prev?.since_sdcv ?? 0,
      last_commit: prev?.last_commit ?? null,
      stale_since: prev?.stale_since ?? today,
    };
  });
  const totals = {
    loc: projects.reduce((s, p) => s + p.loc, 0),
    since_sdcv: projects.reduce((s, p) => s + p.since_sdcv, 0),
  };
  return { updated_at: now.toISOString(), projects, totals };
}

export function upsertHistory(history, date, totals) {
  return [...history.filter((r) => r.date !== date), { date, since_sdcv: totals.since_sdcv, loc: totals.loc }]
    .sort((a, b) => a.date.localeCompare(b.date));
}
