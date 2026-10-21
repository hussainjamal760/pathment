/**
 * Selection-pool scoring decides who gets a place, so its failure modes have
 * to be loud: unreviewed work must block a ranking rather than count as zero,
 * a tie at the cutoff must stop for a person, and a withdrawn candidate must
 * never take somebody's seat.
 */
const { taskScore, scoreMember, rankMembers, bucketFor } = require('../../src/utils/poolScoring');

const policy = {
  version: 1,
  components: [
    { key: 'quiz', label: 'Quiz', weight: 30, roadmapTaskIds: ['q1'] },
    { key: 'project', label: 'Project', weight: 70, roadmapTaskIds: ['p1', 'p2'] }
  ]
};
const done = (roadmapTaskId, rating) => ({ roadmapTaskId, status: 'completed', finalRating: rating });

describe('taskScore', () => {
  it('turns a reviewed rating into a percentage', () => {
    expect(taskScore(done('x', 4))).toEqual({ score: 80 });
  });

  it('marks submitted work as pending, not zero', () => {
    expect(taskScore({ status: 'submitted' })).toEqual({ pending: true });
  });

  it('scores undelivered work as zero', () => {
    expect(taskScore({ status: 'assigned' })).toEqual({ score: 0 });
  });
});

describe('scoreMember', () => {
  it('weights each component and explains every part', () => {
    const s = scoreMember(policy, [done('q1', 5), done('p1', 4), done('p2', 2)]);
    expect(s.components.map((c) => [c.key, c.score])).toEqual([['quiz', 100], ['project', 60]]);
    expect(s.total).toBe(72); // 0.3 * 100 + 0.7 * 60
    expect(s.pendingReview).toBe(false);
  });

  it('withholds a total while any work waits for review', () => {
    const s = scoreMember(policy, [done('q1', 5), { roadmapTaskId: 'p1', status: 'submitted' }]);
    expect(s.pendingReview).toBe(true);
    expect(s.total).toBeNull();
  });

  it('ignores cancelled work', () => {
    const s = scoreMember(policy, [done('q1', 5), { roadmapTaskId: 'p1', status: 'cancelled' }, done('p2', 5)]);
    expect(s.total).toBe(100);
  });
});

describe('rankMembers', () => {
  const m = (id, total, extra = {}) => ({ id, email: `${id}@x.io`, total, pendingReview: false, decision: null, ...extra });

  it('proposes the top quota, deterministically', () => {
    const { ranked, blockers } = rankMembers([m('c', 50), m('a', 90), m('b', 70)], 2);
    expect(ranked.map((r) => [r.id, r.rank, r.proposed])).toEqual([['a', 1, true], ['b', 2, true], ['c', 3, false]]);
    expect(blockers).toEqual({ pendingReview: [], tieAtCutoff: [] });
  });

  it('flags a tie that straddles the cutoff', () => {
    const { blockers } = rankMembers([m('a', 90), m('b', 70), m('c', 70)], 2);
    expect(blockers.tieAtCutoff.sort()).toEqual(['b', 'c']);
  });

  it('does not flag a tie inside the shortlist', () => {
    const { blockers } = rankMembers([m('a', 90), m('b', 90), m('c', 70)], 2);
    expect(blockers.tieAtCutoff).toEqual([]);
  });

  it('leaves out withdrawn and disqualified candidates', () => {
    const { ranked } = rankMembers([m('a', 99, { decision: 'withdrawn' }), m('b', 10), m('c', 99, { decision: 'disqualified' })], 1);
    expect(ranked.map((r) => r.id)).toEqual(['b']);
  });

  it('reports candidates with unreviewed work instead of ranking them', () => {
    const { ranked, blockers } = rankMembers([m('a', null, { pendingReview: true }), m('b', 40)], 1);
    expect(blockers.pendingReview).toEqual(['a']);
    expect(ranked.map((r) => r.id)).toEqual(['b']);
  });
});

describe('bucketFor', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const member = { userId: 'u1', decision: null };

  it('puts a candidate without an account in invite_pending', () => {
    expect(bucketFor({ userId: null, decision: null }, [], { now })).toBe('invite_pending');
  });

  it('lets a decision win over the work', () => {
    expect(bucketFor({ ...member, decision: 'withdrawn' }, [{ status: 'submitted' }], { now })).toBe('withdrawn');
  });

  it('surfaces work waiting on a reviewer', () => {
    expect(bucketFor(member, [{ status: 'submitted' }, { status: 'completed' }], { now })).toBe('needs_review');
  });

  it('calls overdue open work stalled', () => {
    const task = { status: 'assigned', dueDate: '2026-10-19T00:00:00Z', assignedAt: '2026-10-18T00:00:00Z' };
    expect(bucketFor(member, [task], { now })).toBe('stalled');
  });

  it('calls finished work completed', () => {
    expect(bucketFor(member, [{ status: 'completed' }], { now })).toBe('completed');
  });
});
