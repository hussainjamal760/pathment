import { apiClient } from './api-client';

export const taskApi = {
  // Mentee APIs
  getMenteeTasks: (menteeId: string, params?: { status?: string; enrollmentId?: string }) =>
    apiClient.get(`/tasks/mentee/${menteeId}`, { params }),

  getMenteeTaskStats: (menteeId: string, enrollmentId?: string) =>
    apiClient.get(`/tasks/mentee/${menteeId}/stats`, { params: { enrollmentId } }),

  getTaskById: (taskId: string) =>
    apiClient.get(`/tasks/${taskId}`),

  submitTask: (taskId: string, data: { submissionText: string; submissionUrls?: string[] }) =>
    apiClient.post(`/tasks/${taskId}/submit`, data),

  updateTaskStatus: (taskId: string, status: string) =>
    apiClient.patch(`/tasks/${taskId}/status`, { status }),

  // Mentor APIs
  getMentorTasks: (mentorId: string, params?: { 
    status?: string; 
    enrollmentId?: string; 
    menteeId?: string;
    pendingReview?: boolean;
  }) =>
    apiClient.get(`/tasks/mentor/${mentorId}`, { params }),

  getMentorTaskStats: (mentorId: string) =>
    apiClient.get(`/tasks/mentor/${mentorId}/stats`),

  createCustomTask: (data: {
    menteeId: string;
    enrollmentId?: string; // Optional: server resolves active enrollment if omitted
    roadmapTaskId?: string; // Optional: assign existing roadmap task
    trackId?: string; // Optional: personal lane
    title?: string;
    description?: string;
    type?: string;
    difficulty?: string;
    dueDate?: string;
    pointsBase?: number;
    deliverable?: string;
    acceptanceCriteria?: string[];
  }) =>
    apiClient.post('/tasks/custom', data),

  bulkCreateCustomTasks: (data: {
    menteeIds: string[];
    trackId?: string;
    title?: string;
    description?: string;
    type?: string;
    difficulty?: string;
    dueDate?: string;
    pointsBase?: number;
    deliverable?: string;
    acceptanceCriteria?: string[];
  }) =>
    apiClient.post('/tasks/custom/bulk', data),

  reviewTask: (taskId: string, data: {
    rating: number;
    feedback: string;
    status: 'completed' | 'revision_needed';
    pointsAwarded?: number;
  }) =>
    apiClient.post(`/tasks/${taskId}/review`, data),

  cancelTask: (taskId: string, reason?: string) =>
    apiClient.post(`/tasks/${taskId}/cancel`, { reason }),

  deleteCustomTask: (taskId: string) =>
    apiClient.delete(`/tasks/${taskId}`),

  // Roadmap APIs
  getRoadmapTasks: (programId: string, levelId: string, menteeId?: string) =>
    apiClient.get(`/tasks/roadmap/program/${programId}/level/${levelId}`, {
      params: menteeId ? { menteeId } : undefined
    }),

  // Admin APIs
  autoAssignWeekTasks: (enrollmentId: string, weekNumber: number) =>
    apiClient.post('/tasks/auto-assign', { enrollmentId, weekNumber })
};

export default taskApi;
