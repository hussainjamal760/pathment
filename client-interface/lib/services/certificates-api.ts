import { apiClient } from './api-client';

export interface CertificateElement {
  id: string;
  text: string;
  type: 'static' | 'dynamic' | 'badge' | 'image';
  dynamicKey?: 'mentee_name' | 'mentor_name' | 'date_issued' | 'fellowship_name' | 'issuer_name' | 'issuer_title';
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
    taskIds: string[];
  }>;
  createdBy: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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

export const certificatesApi = {
  // Templates CRUD
  listTemplates: () => 
    apiClient.get<{ success: boolean; data: CertificateTemplate[] }>('/certificates/templates'),
    
  getTemplate: (id: string) => 
    apiClient.get<{ success: boolean; data: CertificateTemplate }>(`/certificates/templates/${id}`),
    
  createTemplate: (data: Partial<CertificateTemplate>) => 
    apiClient.post<{ success: boolean; data: CertificateTemplate }>('/certificates/templates', data),
    
  updateTemplate: (id: string, data: Partial<CertificateTemplate>) => 
    apiClient.put<{ success: boolean; data: CertificateTemplate }>(`/certificates/templates/${id}`, data),
    
  deleteTemplate: (id: string) => 
    apiClient.delete<{ success: boolean }>(`/certificates/templates/${id}`),

  uploadAsset: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<{ success: boolean; url: string }>('/certificates/upload', formData);
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
    apiClient.post<{ success: boolean; message: string; updated: number }>(`/certificates/templates/${id}/resend`, { failedOnly })
};
