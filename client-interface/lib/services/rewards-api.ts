import { apiClient } from './api-client';

/** Rewards: gift catalog + redemptions. */
export const rewardsApi = {
  overview: () => apiClient.get('/rewards'),
  redeem: (giftId: string, menteeId: string) => apiClient.post('/rewards/redeem', { giftId, menteeId }),
  createGift: (data: { name: string; description?: string; costXp?: number; stock?: number | null }) =>
    apiClient.post('/rewards/gifts', data),
  removeGift: (id: string) => apiClient.delete(`/rewards/gifts/${id}`),
};
