import { apiClient } from './api-client';

/** Mentee cohort community feed. */
export const communityApi = {
  feed: () => apiClient.get('/community/feed'),
  people: () => apiClient.get('/community/people'),
  createPost: (data: { type: string; body: string; toId?: string }) => apiClient.post('/community/posts', data),
  react: (id: string, type: 'cheers' | 'helpful') => apiClient.post(`/community/posts/${id}/react`, { type }),
};
