import { apiClient } from './api-client';

export interface FailedEmail {
  id: string;
  recipientEmail: string;
  subject: string;
  emailType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  errorCategory: string | null;
  lastError: string | null;
  failedAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

export interface SuppressedEntry {
  id: string;
  email: string;
  reason: string;
  detail: string | null;
  source: string | null;
  updatedAt: string;
}

/** Admin email-queue ops: DLQ inspection, retry, suppression list. */
export const emailAdminApi = {
  stats: () => apiClient.get<{ data: { byStatus: Record<string, number>; suppressed: number } }>('/admin/emails/stats'),
  list: (status: string = 'dead', page = 1, limit = 50) =>
    apiClient.get<{ data: { emails: FailedEmail[]; total: number; page: number; limit: number } }>('/admin/emails', { params: { status, page, limit } }),
  retry: (id: string) => apiClient.post(`/admin/emails/${id}/retry`),
  retryAllDead: () => apiClient.post<{ data: { requeued: number } }>('/admin/emails/retry-all-dead'),
  suppressed: () => apiClient.get<{ data: { suppressed: SuppressedEntry[] } }>('/admin/emails/suppressed'),
  unsuppress: (email: string) => apiClient.delete(`/admin/emails/suppressed/${encodeURIComponent(email)}`),
};
