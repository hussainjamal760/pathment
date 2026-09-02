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

export const BACKGROUND_PRESETS = [
  {
    id: 'preset-classic-navy',
    name: 'Classic Navy & Gold',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <rect width="800" height="600" fill="#0f172a"/>
      <rect x="20" y="20" width="760" height="560" fill="none" stroke="#e2e8f0" stroke-width="2" opacity="0.1"/>
      <rect x="30" y="30" width="740" height="540" fill="none" stroke="#d97706" stroke-width="1.5" opacity="0.4"/>
    </svg>`
  },
  {
    id: 'preset-emerald-luxury',
    name: 'Emerald Luxury',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <rect width="800" height="600" fill="#064e3b"/>
      <rect x="25" y="25" width="750" height="550" fill="none" stroke="#34d399" stroke-width="2" opacity="0.2"/>
    </svg>`
  }
];

export const BACKGROUND_PRESETS_MAP: Record<string, typeof BACKGROUND_PRESETS[0]> = Object.fromEntries(
  BACKGROUND_PRESETS.map(p => [p.id, p])
);

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
  criteria?: Array<{
    id: string;
    name: string;
    badgeUrl?: string;
    keywords?: string[] | null;
    minScorePercent?: number | null;
    maxOpenBlockers?: number | null;
    minCompletionRate?: number | null;
    minOnTimeRate?: number | null;
    minAvgRating?: number | null;
    customRule?: string | null;
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

  getAIEvaluationStatus: (id: string, runId?: string) => {
    const qs = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    return apiClient.get<{
      success: boolean;
      runId: string | null;
      isDone: boolean;
      total: number;
      completed: number;
      failed: number;
      pending: number;
      data: AIEvaluationResult[];
      ranAt: string | null;
    }>(`/certificates/templates/${id}/ai-evaluate/status${qs}`);
  }
};

