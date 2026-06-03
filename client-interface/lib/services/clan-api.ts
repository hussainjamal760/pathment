import { apiClient } from './api-client';

/** Clans — mentor-led groups inside a program (admin management + assignment). */
export const clanApi = {
  list: (programId?: string, status?: string) =>
    apiClient.get('/clans', { params: { programId, status } }),
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
