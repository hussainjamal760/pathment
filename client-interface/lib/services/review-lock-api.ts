import { apiClient } from './api-client';

// ── Shared shapes ─────────────────────────────────────────────────────────────
export interface ReviewLockMentor {
  id: string;
  name: string;
  clanName: string | null;
}

export interface ReviewLockRequest {
  id: string;
  mentor: ReviewLockMentor;
  sessionId: string | null;
  sessionDate: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionNote: string | null;
}

export interface ReviewLockGrant {
  id: string;
  mentor: ReviewLockMentor;
  reason: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export interface ReviewLockLog {
  action: string;
  userName: string | null;
  detail: string | null;
  createdAt: string;
}

// ── Admin responses ───────────────────────────────────────────────────────────
export interface ReviewLockState {
  locked: boolean;
  pendingRequests: number;
  activeGrants: number;
}

export interface RespondResult {
  request: ReviewLockRequest;
  grant: ReviewLockGrant | null;
}

// ── Mentor responses ──────────────────────────────────────────────────────────
export interface MentorLockState {
  locked: boolean;
  hasActiveGrant: boolean;
  grantExpiresAt: string | null;
  pendingRequest: { id: string; createdAt: string } | null;
}

/**
 * Cohort-review deletion lock. Admins lock review-record deletion org-wide for
 * audit integrity; mentors request time-boxed access and admins grant it. The
 * server wraps every payload in the standard `successResponse` envelope
 * (`{ success, message, data }`), and `apiClient` returns the raw body — so each
 * method unwraps `.data` to return the bare contract shape to callers.
 */
export const reviewLockApi = {
  // Admin
  state: () => apiClient.get<{ data: ReviewLockState }>('/admin/review-lock').then((r) => r.data),
  setLocked: (locked: boolean) =>
    apiClient.patch<{ data: { locked: boolean } }>('/admin/review-lock', { locked }).then((r) => r.data),
  requests: (status: 'pending' | 'all' = 'pending') =>
    apiClient.get<{ data: { requests: ReviewLockRequest[] } }>('/admin/review-lock/requests', { params: { status } }).then((r) => r.data),
  respond: (id: string, body: { approve: boolean; durationHours?: number; expiresAt?: string; note?: string }) =>
    apiClient.post<{ data: RespondResult }>(`/admin/review-lock/requests/${id}/respond`, body).then((r) => r.data),
  grants: (active = true) =>
    apiClient.get<{ data: { grants: ReviewLockGrant[] } }>('/admin/review-lock/grants', { params: { active } }).then((r) => r.data),
  revokeGrant: (id: string) =>
    apiClient.delete<{ data: { revoked: true } }>(`/admin/review-lock/grants/${id}`).then((r) => r.data),
  logs: (page = 1, limit = 10) =>
    apiClient.get<{ data: { logs: ReviewLockLog[]; total: number; page: number; limit: number } }>('/admin/review-lock/logs', { params: { page, limit } }).then((r) => r.data),

  // Mentor
  mentorLockState: () => apiClient.get<{ data: MentorLockState }>('/mentor/review/lock-state').then((r) => r.data),
  requestUnlock: (body: { sessionId?: string; reason: string }) =>
    apiClient.post<{ data: { request: ReviewLockRequest } }>('/mentor/review/unlock-request', body).then((r) => r.data),
};
