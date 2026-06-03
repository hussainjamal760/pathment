import { apiClient } from './api-client';

/** Org announcements + reactions. */
export const announcementsApi = {
  list: (audience?: string) => apiClient.get('/announcements', { params: { audience } }),
  create: (data: { title: string; body: string; audience?: string }) => apiClient.post('/announcements', data),
  togglePin: (id: string) => apiClient.patch(`/announcements/${id}/pin`, {}),
  react: (id: string, type: 'acknowledged' | 'helpful') => apiClient.post(`/announcements/${id}/react`, { type }),
  remove: (id: string) => apiClient.delete(`/announcements/${id}`),
};
