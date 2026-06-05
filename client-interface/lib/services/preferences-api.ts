import { apiClient } from './api-client';

/** Persist a namespaced group of settings toggles into user_settings.preferences. */
export const preferencesApi = {
  update: (group: 'notifications' | 'learning' | 'system' | 'userManagement', values: Record<string, unknown>) =>
    apiClient.patch('/profile/preferences', { group, values }),

  /** The notification prefs the server actually reads (emailNotifications). */
  getEmailNotifications: () =>
    apiClient.get<any>('/profile').then((r) => (r.data?.settings?.emailNotifications as Record<string, boolean>) || {}),
  /** Persist into user_settings.emailNotifications — genuinely gates email delivery. */
  updateNotifications: (emailNotifications: Record<string, boolean>) =>
    apiClient.patch('/profile/notifications', { emailNotifications }),
};
