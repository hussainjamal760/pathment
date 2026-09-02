import { apiClient } from './api-client';

export interface CertificateElement {
  id: string;
  text: string;
  type: 'static' | 'dynamic' | 'badge' | 'image';
  dynamicKey?: 'mentee_name' | 'mentor_name' | 'date_issued' | 'program_name' | 'fellowship_name' | 'issuer_name' | 'issuer_title';
  xPercent: number;
  yPercent: number;
  fontSizePercent: number;
  color: string;
  fontWeight: string;
  alignment: 'left' | 'center' | 'right';
  fontStyle?: string;
  widthPercent?: number;
  imageUrl?: string;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  bgImageUrl?: string;
  logoUrl?: string;
  logoConfig?: {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
  };
  config: CertificateElement[];
  goldBadgeUrl?: string;
  silverBadgeUrl?: string;
  bronzeBadgeUrl?: string;
  participationBadgeUrl?: string;
  criteria?: Array<{
    id: string;
    name: string;
    badgeUrl?: string;
    // Legacy (task-ID-based)
    taskIds?: string[];
    maxBlockers?: number;    // legacy
    // Current AI-based
    keywords?: string[];
    minScorePercent?: number;   // 0-100 HARD threshold
    maxOpenBlockers?: number;   // -1 = unlimited; >=0 = max allowed
    minCompletionRate?: number; // 0 = off; % tasks completed
    minOnTimeRate?: number;     // 0 = off; % submitted on time
    minAvgRating?: number;      // 0 = off; 0.5-5 scale
    customRule?: string;        // free-text AI rule
  }>;
  aiEvaluation?: { results: AIEvaluationResult[]; ranAt: string } | null;
  aiEvaluationRanAt?: string | null;

  createdBy: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  programId: string;
  program?: {
    id: string;
    name: string;
  };
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface CertificateInstance {
  id: string;
  templateId: string;
  menteeId: string;
  mentorId?: string;
  issuedBy: string;
  pdfUrl?: string;
  imageUrl?: string;
  tier: string;
  metadata: any;
  template?: CertificateTemplate;
  mentee?: { id: string; firstName: string; lastName: string; email: string };
  mentor?: { id: string; firstName: string; lastName: string };
  issuer?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface AIBlockersAnalysis {
  total: number;
  resolved: number;
  impact: 'Low' | 'Medium' | 'High';
  summary: string;
}

export interface AIEvaluationResult {
  mentee_id: string;
  firstName: string;
  lastName: string;
  email: string;
  is_eligible: boolean;
  certificate_tier: string;
  match_score: number;        // 0-100 holistic quality score WITHIN eligible tier
  overall_percentage: number; // normalized points % (ground truth)
  matched_keywords: string[];
  missing_keywords: string[];
  hard_constraints_check: {
    score_ok:           boolean;
    blockers_ok:        boolean;
    completion_rate_ok: boolean;
    on_time_rate_ok:    boolean;
    rating_ok:          boolean;
  };
  blockers_analysis: AIBlockersAnalysis;
  reasoning: string;
}

export const certificatesApi = {

  // Templates CRUD
  listTemplates: (programId?: string) => {
    const qs = new URLSearchParams();
    if (programId) qs.set('programId', programId);
    return apiClient.get<{ success: boolean; data: CertificateTemplate[] }>(`/certificates/templates?${qs.toString()}`);
  },
    
  getTemplate: (id: string) => 
    apiClient.get<{ success: boolean; data: CertificateTemplate }>(`/certificates/templates/${id}`),
    
  createTemplate: (data: Partial<CertificateTemplate>) => 
    apiClient.post<{ success: boolean; data: CertificateTemplate }>('/certificates/templates', data),
    
  updateTemplate: (id: string, data: Partial<CertificateTemplate>) => 
    apiClient.put<{ success: boolean; data: CertificateTemplate }>(`/certificates/templates/${id}`, data),
    
  deleteTemplate: (id: string) => 
    apiClient.delete<{ success: boolean }>(`/certificates/templates/${id}`),

  uploadAsset: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ success: boolean; url?: string; data?: { url: string } }>('/certificates/upload', formData);
    const url = res.url || res.data?.url || '';
    return { ...res, url };
  },

  getQualification: (id: string, params: { mentorId?: string; programId?: string }) => {
    const qs = new URLSearchParams();
    if (params.mentorId)  qs.set('mentorId', params.mentorId);
    if (params.programId) qs.set('programId', params.programId);
    qs.set('_t', Date.now().toString());
    return apiClient.get<{
      success: boolean;
      data: {
        [tierId: string]: Array<{
          id: string; firstName: string; lastName: string; email: string;
          completedCount: number; totalTasks: number; criteriaMatch: number;
          assignedTier?: string;
          tierMatches?: Record<string, number>;
        }>;
      };
      criteriaTasks?: Array<{ id: string; title: string }>;
    }>(`/certificates/templates/${id}/qualification?${qs.toString()}`);
  },

  sendToMentors: (templateId: string, programId: string) =>
    apiClient.post<{ success: boolean; message: string; sent: number }>(
      `/certificates/templates/${templateId}/send-to-mentors`, { programId }
    ),

  // Instances / Issuance
  issueCertificates: (data: { 
    templateId: string; 
    menteeIds?: string[]; 
    mentorId?: string; 
    tier?: string;
    recipients?: Array<{ menteeId: string; tier: string }>
  }) => 
    apiClient.post<{ success: boolean; message: string; data: { instances: any[]; jobs: any[] } }>('/certificates/instances', data),
    
  listMenteeCertificates: (menteeId: string) => 
    apiClient.get<{ success: boolean; data: CertificateInstance[] }>(`/certificates/instances/mentee/${menteeId}`),
    
  getCertificateInstance: (id: string) => 
    apiClient.get<{ success: boolean; data: CertificateInstance }>(`/certificates/instances/${id}`),

  getTemplateHistory: (id: string) =>
    apiClient.get<{
      success: boolean;
      data: Array<{
        id: string;
        pdfUrl: string | null;
        imageUrl: string | null;
        tier: string;
        createdAt: string;
        recipient: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        error: string | null;
      }>;
    }>(`/certificates/templates/${id}/history`),

  deleteCertificateInstance: (id: string) =>
    apiClient.delete<{ success: boolean; message: string }>(`/certificates/instances/${id}`),

  resendCertificateInstance: (id: string) =>
    apiClient.post<{ success: boolean; message: string }>(`/certificates/instances/${id}/resend`),

  revokeAllTemplateCertificates: (id: string) =>
    apiClient.delete<{ success: boolean; message: string }>(`/certificates/templates/${id}/instances`),

  resendAllTemplateCertificates: (id: string, failedOnly: boolean) =>
    apiClient.post<{ success: boolean; message: string; updated: number }>(`/certificates/templates/${id}/resend`, { failedOnly }),

  runAIEvaluation: (id: string, mentorId?: string) => {
    const qs = mentorId ? `?mentorId=${encodeURIComponent(mentorId)}` : '';
    return apiClient.post<{ success: boolean; runId: string; total: number; message: string }>(`/certificates/templates/${id}/ai-evaluate${qs}`, {});
  },

  getAIEvaluationStatus: (id: string, runId: string) =>
    apiClient.get<{
      success: boolean;
      isDone: boolean;
      total: number;
      completed: number;
      failed: number;
      pending: number;
      data: AIEvaluationResult[];
      ranAt: string | null;
    }>(`/certificates/templates/${id}/ai-evaluate/status?runId=${encodeURIComponent(runId)}`)
};

