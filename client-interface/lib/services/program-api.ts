// API Service for Program, Level, and Roadmap Management

import { apiClient } from './api-client';
import type { Program, ProgramLevel, Roadmap, RoadmapWeek, RoadmapTask } from '../types';

export interface ProgramFilters {
  search?: string;
  status?: string;
  type?: string;
  tags?: string | string[];
  sortBy?: 'createdAt' | 'name' | 'startDate';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export interface ProgramListResponse {
  success: boolean;
  message: string;
  statusCode: number;
  data: Program[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
    total?: number; // server may return total instead of totalItems
  };
}

// Program API
export const programsApi = {
  // Create program
  create: async (data: any) => {
    const response = await apiClient.post<any>('/programs', data);
    return response.data;
  },

  // Get all programs
  getAll: async (filters?: ProgramFilters): Promise<ProgramListResponse> => {
    const response = await apiClient.get<ProgramListResponse>('/programs', { params: filters });
    return response;
  },

  // Get program by ID
  getById: async (id: string) => {
    const response = await apiClient.get<any>(`/programs/${id}`);
    return response.data;
  },

  // Update program
  update: async (id: string, data: any) => {
    const response = await apiClient.put<any>(`/programs/${id}`, data);
    return response.data;
  },

  // Delete program
  delete: async (id: string) => {
    const response = await apiClient.delete(`/programs/${id}`);
    return response.data;
  },

  // Get program stats
  getStats: async (id: string) => {
    const response = await apiClient.get<any>(`/programs/${id}/stats`);
    return response.data;
  },

  // Clone program
  clone: async (id: string, data: any) => {
    const response = await apiClient.post<any>(`/programs/${id}/clone`, data);
    return response.data;
  },
};

// Level API
export const levelsApi = {
  create: async (programId: string, data: any) => {
    const response = await apiClient.post<any>(`/programs/${programId}/levels`, data);
    return response.data;
  },
  getByProgram: async (programId: string) => {
    const response = await apiClient.get<any>(`/programs/${programId}/levels`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await apiClient.get<any>(`/levels/${id}`);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await apiClient.put<any>(`/levels/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await apiClient.delete(`/levels/${id}`);
    return response.data;
  },
  reorder: async (programId: string, levelIds: string[]) => {
    const response = await apiClient.put(`/programs/${programId}/levels/reorder`, { levelIds });
    return response.data;
  },
};

// Combined API export
export const programManagementApi = {
  programs: programsApi,
  levels: levelsApi,
};

export default programManagementApi;
