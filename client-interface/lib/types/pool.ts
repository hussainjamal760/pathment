/** Selection pools: candidates tested and selected before clan placement. */

export type PoolStatus = 'draft' | 'open' | 'qualifying' | 'reviewing' | 'placing' | 'closed';
export type PoolDecision = 'selected' | 'waitlisted' | 'not_selected' | 'withdrawn' | 'disqualified';
export type PoolBucket =
  | 'invite_pending' | 'not_started' | 'in_progress' | 'needs_review'
  | 'changes_requested' | 'completed' | 'stalled' | 'withdrawn' | 'disqualified';

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  workCount?: number;
}

export interface CandidatePool {
  id: string;
  programId: string;
  cohortId: string | null;
  name: string;
  description: string | null;
  status: PoolStatus;
  capacity: number | null;
  selectionQuota: number;
  qualificationDueAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
  awardPoints: boolean;
  scoringPolicy: { version: number; components: ScoreComponent[] };
  reminderPolicy: { enabled?: boolean; inviteAfterDays?: number; inactivityDays?: number };
  program?: { id: string; name: string } | null;
  memberCount?: number;
  selectedCount?: number;
}

export interface PoolMemberRow {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
  bucket: PoolBucket;
  decision: PoolDecision | null;
  decisionReason: string | null;
  tasksTotal: number;
  tasksCompleted: number;
  components: (ScoreComponent & { score: number | null; pending: boolean })[];
  total: number | null;
  pendingReview: boolean;
  rank: number | null;
  placedClan: { id: string; name: string } | null;
  placedAt: string | null;
}

export interface ShortlistSnapshot {
  policyVersion: number;
  quota: number;
  generatedAt: string;
  entries: { memberId: string; total: number; rank: number; proposed: boolean }[];
  blockers: { pendingReview: string[]; tieAtCutoff: string[] };
}

export interface PoolStats {
  candidates: number;
  withAccount: number;
  tasks: number;
  tasksCompleted: number;
  awaitingReview: number;
  averageScore: number | null;
  placed: number;
}

export interface PoolDashboard {
  pool: CandidatePool;
  /** One page of the candidates that match the request's filters. */
  members: PoolMemberRow[];
  total: number;
  page: number;
  limit: number;
  buckets: Partial<Record<PoolBucket, number>>;
  stats: PoolStats;
  latestSnapshot: ShortlistSnapshot | null;
}

export interface ImportResult {
  email: string;
  result: 'added' | 'invited' | 'already_in_pool' | 'duplicate_row' | 'invalid' | 'pool_full' | 'failed';
  memberId?: string;
  reason?: string;
}

export interface PlacementPreview {
  suggestions: { memberId: string; clanId: string | null }[];
  unplaceable: number;
  clans: { id: string; name: string; hasLead: boolean; free: number | null }[];
}

export interface PoolHistory {
  events: { id: string; action: string; actor: string | null; subject: string | null; details: Record<string, unknown> | null; at: string }[];
  snapshots: ShortlistSnapshot[];
}

/** The candidate's own view: no rank, no score, nobody else. */
export interface MyQualification {
  id: string;
  pool: { id: string; name: string; description: string | null; status: PoolStatus; qualificationDueAt: string | null };
  outcome: PoolDecision | null;
  placedClan: { id: string; name: string } | null;
  tasks: { id: string; title: string; type: string; status: string; dueDate: string | null }[];
}
