import { apiClient } from './api-client';

/** Clans — mentor-led groups inside a program (admin management + assignment). */
export const clanApi = {
  list: (programId?: string, status?: string) =>
    apiClient.get('/clans', { params: { programId, status } }),
  /** Org-wide clan-health snapshot grouped by program (admin dashboard). */
  health: () => apiClient.get('/clans/health'),
  /** Programs the current mentor runs, with their clans + roster counts. */
  mentorPrograms: () => apiClient.get('/clans/mentor/programs'),
  get: (id: string) => apiClient.get(`/clans/${id}`),
  create: (data: {
    programId: string;
    name: string;
    description?: string;
    leadMentorId?: string;
    levelLabel?: string;
    tags?: string[];
    maxMentees?: number;
  }) => apiClient.post('/clans', data),
  update: (id: string, data: Record<string, unknown>) => apiClient.patch(`/clans/${id}`, data),
  addMember: (id: string, userId: string, role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team') =>
    apiClient.post(`/clans/${id}/members`, { userId, role }),
  removeMember: (id: string, userId: string) => apiClient.delete(`/clans/${id}/members/${userId}`),
};
