import { apiClient } from './api-client';

export interface TrackTask {
  id: string;
  title: string;
  type: string;
  status: string;
  dueDate: string | null;
}

export interface Track {
  id: string;
  name: string;
  color: string | null;
  source: string;
  archived: boolean;
  orderIndex: number;
  tasks: TrackTask[];
}

/** Tracks: per-mentee personal lanes that tasks belong to. */
export const tracksApi = {
  listForMentee: (menteeId: string, includeArchived = false) =>
    apiClient.get(`/tracks/mentee/${menteeId}${includeArchived ? '?archived=1' : ''}`),
  create: (menteeId: string, data: { name: string; color?: string; source?: string }) =>
    apiClient.post(`/tracks/mentee/${menteeId}`, data),
  reorder: (menteeId: string, orderedIds: string[]) =>
    apiClient.patch(`/tracks/mentee/${menteeId}/reorder`, { orderedIds }),
  rename: (id: string, name: string) => apiClient.patch(`/tracks/${id}`, { name }),
  setArchived: (id: string, archived: boolean) => apiClient.patch(`/tracks/${id}/archive`, { archived }),
  remove: (id: string) => apiClient.delete(`/tracks/${id}`),
  addTask: (id: string, data: { title: string; type?: string; dueDate?: string }) =>
    apiClient.post(`/tracks/${id}/tasks`, data),
  setTaskTrack: (taskId: string, trackId: string | null) =>
    apiClient.patch(`/tracks/task/${taskId}`, { trackId }),
};
