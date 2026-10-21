/**
 * Selection-pool scoring. Pure functions, so the ranking that decides who gets
 * a place can be tested without a database and explained line by line.
 *
 * A task's score is its reviewed rating as a percentage (rating / 5). A quiz in
 * auto mode is reviewed by the system with its percentage as the rating, so
 * every kind of work lands on the same 0-100 scale. A component's score is the
 * mean of its tasks; the total is the weighted mean of the components.
 */

const OPEN_STATUSES = ['assigned', 'not_started', 'in_progress', 'revision_needed'];
const CLOSED_DECISIONS = ['withdrawn', 'disqualified'];

const round2 = (n) => Math.round(n * 100) / 100;

/** One task's 0-100 score, or `pending` while the work waits for a reviewer. */
function taskScore(task) {
  if (task.status === 'completed') return { score: round2((Number(task.finalRating) || 0) / 5 * 100) };
  if (task.status === 'submitted') return { pending: true };
  return { score: 0 }; // not delivered
}

/**
 * Score one candidate against the policy.
 * @returns {{ components: object[], total: number, pendingReview: boolean }}
 */
function scoreMember(policy, tasks) {
  const components = (policy?.components || []).map((c) => {
    const ids = new Set(c.roadmapTaskIds || []);
    const mine = tasks.filter((t) => ids.has(t.roadmapTaskId) && t.status !== 'cancelled');
    const scored = mine.map(taskScore);
    const pending = scored.some((s) => s.pending);
    const values = scored.filter((s) => !s.pending).map((s) => s.score);
    const score = mine.length && !pending ? round2(values.reduce((a, b) => a + b, 0) / values.length) : (mine.length ? null : 0);
    return { key: c.key, label: c.label, weight: Number(c.weight) || 0, score, tasks: mine.length, pending };
  });
  const weights = components.reduce((a, c) => a + c.weight, 0);
  const pendingReview = components.some((c) => c.pending);
  const total = weights > 0 && !pendingReview
    ? round2(components.reduce((a, c) => a + c.weight * (c.score || 0), 0) / weights)
    : null;
  return { components, total, pendingReview };
}

/**
 * Rank scored candidates and propose a shortlist of `quota`.
 *
 * Deterministic: total desc, then email asc, so the same inputs always give
 * the same order. Withdrawn and disqualified candidates are left out. The
 * proposal is blocked, never guessed, when work is unreviewed or the cutoff
 * falls between two equal totals.
 *
 * @param {{ id, email, decision, total, pendingReview }[]} members
 */
function rankMembers(members, quota) {
  const eligible = members.filter((m) => !CLOSED_DECISIONS.includes(m.decision));
  const pendingReview = eligible.filter((m) => m.pendingReview).map((m) => m.id);
  const ranked = eligible
    .filter((m) => !m.pendingReview)
    .sort((a, b) => (b.total - a.total) || String(a.email).localeCompare(String(b.email)))
    .map((m, i) => ({ ...m, rank: i + 1, proposed: i < quota }));

  let tieAtCutoff = [];
  if (quota > 0 && ranked.length > quota) {
    const cutoff = ranked[quota - 1].total;
    if (ranked[quota].total === cutoff) tieAtCutoff = ranked.filter((m) => m.total === cutoff).map((m) => m.id);
  }
  return { ranked, blockers: { pendingReview, tieAtCutoff } };
}

/**
 * Which dashboard bucket a candidate sits in. The decision wins; then the
 * account; then the furthest-behind piece of work, because that is the one
 * somebody has to chase.
 */
function bucketFor(member, tasks, { now = new Date(), inactivityDays = 5 } = {}) {
  if (CLOSED_DECISIONS.includes(member.decision)) return member.decision;
  if (!member.userId) return 'invite_pending';
  const live = tasks.filter((t) => t.status !== 'cancelled');
  if (!live.length) return 'not_started';
  if (live.every((t) => t.status === 'completed')) return 'completed';
  if (live.some((t) => t.status === 'submitted')) return 'needs_review';
  if (live.some((t) => t.status === 'revision_needed')) return 'changes_requested';
  const open = live.filter((t) => OPEN_STATUSES.includes(t.status));
  const quietSince = now.getTime() - inactivityDays * 86400000;
  const stalled = open.some((t) => (t.dueDate && new Date(t.dueDate) < now)
    || new Date(t.startedAt || t.assignedAt).getTime() < quietSince);
  if (stalled) return 'stalled';
  if (live.some((t) => t.startedAt || t.status === 'in_progress' || t.status === 'completed')) return 'in_progress';
  return 'not_started';
}

module.exports = { OPEN_STATUSES, CLOSED_DECISIONS, taskScore, scoreMember, rankMembers, bucketFor };
