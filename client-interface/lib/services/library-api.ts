import { apiClient } from './api-client';

/** Org-shared mentor Library. */
export const libraryApi = {
  list: () => apiClient.get('/library'),
  create: (data: { title: string; category?: string; summary?: string; url?: string; readMins?: number }) =>
    apiClient.post('/library', data),
  togglePin: (id: string) => apiClient.patch(`/library/${id}/pin`, {}),
  remove: (id: string) => apiClient.delete(`/library/${id}`),
};
