import { apiClient } from './api-client';

/** Admin clan operations: change requests, cross-clan assignments, policies. */
export const clanRequestsApi = {
  overview: () => apiClient.get('/clan-requests'),
  resolveRequest: (id: string, status: 'approved' | 'denied', note?: string) =>
    apiClient.patch(`/clan-requests/requests/${id}/resolve`, { status, note }),
  createCrossClan: (data: { kind: string; note?: string }) => apiClient.post('/clan-requests/cross-clan', data),
  removeCrossClan: (id: string) => apiClient.delete(`/clan-requests/cross-clan/${id}`),
  createPolicy: (data: { title: string; category?: string; body: string }) => apiClient.post('/clan-requests/policies', data),
  removePolicy: (id: string) => apiClient.delete(`/clan-requests/policies/${id}`),
};
