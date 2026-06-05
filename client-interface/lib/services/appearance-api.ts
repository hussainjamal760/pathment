import { apiClient } from './api-client';

/** Per-user appearance (accent color + light/dark), synced to user_settings. */
export const appearanceApi = {
  get: () => apiClient.get('/profile/appearance'),
  update: (data: { colorTheme?: string; theme?: string }) =>
    apiClient.patch('/profile/appearance', data),
};
