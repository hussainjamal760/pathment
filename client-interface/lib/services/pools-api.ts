import { apiClient } from './api-client';
import type { PoolDecision } from '@/lib/types/pool';

export interface PoolInput {
  programId?: string;
  cohortId?: string | null;
  name?: string;
  description?: string | null;
  capacity?: number | null;
  selectionQuota?: number;
  qualificationDueAt?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  awardPoints?: boolean;
  components?: { key?: string; label: string; weight: number }[];
  reminderPolicy?: { enabled?: boolean; inviteAfterDays?: number; inactivityDays?: number };
}

export interface PoolWorkInput {
  componentKey: string;
  type: string;
  title?: string;
  description?: string;
  deliverable?: string;
  acceptanceCriteria?: string[];
  dueDate?: string;
  memberIds?: string[];
  quiz?: { kitId: string; evaluationMode?: 'auto' | 'review' };
  interview?: { kitId: string };
  course?: { courseId: string };
}

/** Selection pools (/api/pools). The server checks every call against the pool's programme. */
export const poolsApi = {
  list: () => apiClient.get('/pools'),
  get: (id: string) => apiClient.get(`/pools/${id}`),
  history: (id: string) => apiClient.get(`/pools/${id}/history`),
  create: (data: PoolInput) => apiClient.post('/pools', data),
  update: (id: string, data: PoolInput) => apiClient.patch(`/pools/${id}`, data),
  setStatus: (id: string, status: string) => apiClient.post(`/pools/${id}/status`, { status }),
  importMembers: (id: string, emails: string[]) => apiClient.post(`/pools/${id}/members`, { emails }),
  importApplications: (id: string, statuses?: string[]) =>
    apiClient.post(`/pools/${id}/members/from-applications`, statuses ? { statuses } : {}),
  changeDecision: (id: string, memberId: string, decision: PoolDecision, reason: string) =>
    apiClient.post(`/pools/${id}/members/${memberId}/decision`, { decision, reason }),
  removeMember: (id: string, memberId: string, decision: 'withdrawn' | 'disqualified', reason: string) =>
    apiClient.post(`/pools/${id}/members/${memberId}/remove`, { decision, reason }),
  assignWork: (id: string, data: PoolWorkInput) => apiClient.post(`/pools/${id}/work`, data),
  reviews: (id: string) => apiClient.get(`/pools/${id}/reviews`),
  proposeShortlist: (id: string) => apiClient.post(`/pools/${id}/shortlist`),
  finalize: (id: string, overrides: { memberId: string; decision: PoolDecision; reason: string }[]) =>
    apiClient.post(`/pools/${id}/finalize`, { overrides }),
  placementPreview: (id: string) => apiClient.get(`/pools/${id}/placements/preview`),
  place: (id: string, placements: { memberId: string; clanId: string }[]) =>
    apiClient.post(`/pools/${id}/placements`, { placements }),
  mine: () => apiClient.get('/pools/mine'),
};
