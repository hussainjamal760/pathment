import { apiClient } from './api-client';

// ── Types ──────────────────────────────────────────────────────────────────
export type InterviewQuestionKind = 'voice' | 'code' | 'text';
export type InterviewTimingMode = 'per_question' | 'total';
export type InterviewKitStatus = 'draft' | 'published' | 'archived';

export interface InterviewQuestionInput {
  id?: string;
  kind: InterviewQuestionKind;
  prompt: string;
  timeLimitSeconds?: number;
  points?: number;
  required?: boolean;
  codeLanguage?: string;
  starterCode?: string | null;
  referenceAnswer?: string | null;
  config?: Record<string, unknown>;
}

export interface InterviewKitInput {
  title: string;
  description?: string | null;
  timingMode?: InterviewTimingMode;
  totalSeconds?: number | null;
  cameraDefault?: boolean;
  aiGradingDefault?: boolean;
  allowRetakeDefault?: boolean;
  status?: InterviewKitStatus;
  questions?: InterviewQuestionInput[];
}

export interface InterviewKitSummary {
  id: string;
  title: string;
  description: string | null;
  status: InterviewKitStatus;
  timingMode: InterviewTimingMode;
  totalSeconds: number | null;
  cameraDefault: boolean;
  aiGradingDefault: boolean;
  allowRetakeDefault: boolean;
  questionCount: number;
  totalPoints: number;
  updatedAt: string;
}

export interface InterviewKit extends Omit<InterviewKitSummary, 'questionCount'> {
  createdBy: string;
  programId: string | null;
  clanId: string | null;
  settings: Record<string, unknown>;
  questions: Required<InterviewQuestionInput>[];
  createdAt: string;
}

// Per-assignment options passed on a custom `interview` task.
export interface InterviewAssignOptions {
  kitId: string;
  allowRetake?: boolean;
  cameraRequired?: boolean;
  aiGradingEnabled?: boolean;
  timingMode?: InterviewTimingMode;
  totalSeconds?: number | null;
}

// ── Candidate runner types ─────────────────────────────────────────────────
export interface CandidateQuestion {
  id: string;
  position: number;
  kind: InterviewQuestionKind;
  prompt: string;
  timeLimitSeconds: number | null;
  points: number;
  required: boolean;
  codeLanguage: string | null;
  starterCode: string | null;
}

export interface SavedAnswer {
  questionId: string;
  transcript: string | null;
  audioUrl: string | null;
  code: string | null;
  answerText: string | null;
  timeSpentSeconds: number;
}

export interface CandidateInterview {
  task: { id: string; status: string; dueDate: string | null };
  kit: { id: string; title: string; description: string | null; totalPoints: number };
  options: {
    allowRetake: boolean;
    cameraRequired: boolean;
    timingMode: InterviewTimingMode;
    totalSeconds: number | null;
  };
  questions: CandidateQuestion[];
  state: {
    canStart: boolean;
    activeSessionId: string | null;
    attemptNumber: number;
    submittedCount: number;
    savedAnswers: SavedAnswer[];
  };
}

export interface SaveAnswerPayload {
  questionId: string;
  transcript?: string | null;
  code?: string | null;
  answerText?: string | null;
  timeSpentSeconds?: number;
}

export interface ProctorEvent {
  type: string;
  at?: string;
  meta?: Record<string, unknown>;
}

// ── API ──────────────────────────────────────────────────────────────────
export const interviewApi = {
  // Authoring. Pass `status` (e.g. 'published') to limit to assignable kits.
  listKits: (status?: InterviewKitStatus) =>
    apiClient.get('/interviews/kits', status ? { params: { status } } : undefined),
  getKit: (id: string) => apiClient.get(`/interviews/kits/${id}`),
  createKit: (data: InterviewKitInput) => apiClient.post('/interviews/kits', data),
  updateKit: (id: string, data: Partial<InterviewKitInput>) => apiClient.patch(`/interviews/kits/${id}`, data),
  deleteKit: (id: string) => apiClient.delete(`/interviews/kits/${id}`),

  // Candidate runner
  getCandidateInterview: (taskId: string) => apiClient.get(`/interviews/assignments/${taskId}`),
  startInterview: (taskId: string) => apiClient.post(`/interviews/assignments/${taskId}/start`, {}),
  saveAnswer: (sessionId: string, payload: SaveAnswerPayload) =>
    apiClient.patch(`/interviews/sessions/${sessionId}/answer`, payload),
  uploadAnswerAudio: (sessionId: string, questionId: string, blob: Blob) => {
    const fd = new FormData();
    fd.append('questionId', questionId);
    fd.append('audio', blob, `answer-${questionId}.webm`);
    return apiClient.post(`/interviews/sessions/${sessionId}/audio`, fd);
  },
  logProctor: (sessionId: string, events: ProctorEvent[]) =>
    apiClient.post(`/interviews/sessions/${sessionId}/proctor`, { events }),
  uploadSnapshot: (sessionId: string, blob: Blob) => {
    const fd = new FormData();
    fd.append('image', blob, `snapshot-${Date.now()}.jpg`);
    return apiClient.post(`/interviews/sessions/${sessionId}/snapshot`, fd);
  },
  submitInterview: (sessionId: string) =>
    apiClient.post(`/interviews/sessions/${sessionId}/submit`, {}),

  // Mentor review
  getReview: (taskId: string) => apiClient.get(`/interviews/review/${taskId}`),
  gradeAnswer: (taskId: string, questionId: string, data: { pointsAwarded?: number; scoreNote?: string | null }) =>
    apiClient.patch(`/interviews/review/${taskId}/answer`, { questionId, ...data }),
  aiDraftAnswer: (taskId: string, questionId: string) =>
    apiClient.post(`/interviews/review/${taskId}/ai-draft`, { questionId }),
  finalizeReview: (taskId: string, overallNote?: string) =>
    apiClient.post(`/interviews/review/${taskId}/finalize`, { overallNote }),
};

// ── Review types ────────────────────────────────────────────────────────────
export interface ReviewAnswer {
  transcript: string | null;
  audioUrl: string | null;
  code: string | null;
  answerText: string | null;
  timeSpentSeconds: number;
  pointsAwarded: number | null;
  scoreNote: string | null;
  aiDraft: { score: number; suggestedPoints: number; note: string; at: string } | null;
}
export interface ReviewItem {
  questionId: string;
  position: number;
  kind: InterviewQuestionKind;
  prompt: string;
  points: number;
  codeLanguage: string | null;
  referenceAnswer: string | null;
  answer: ReviewAnswer | null;
}
export interface InterviewReview {
  task: { id: string; status: string; pointsAwarded: number | null; menteeId: string };
  kit: { id: string; title: string; description: string | null };
  options: { aiGradingEnabled: boolean; allowRetake: boolean; cameraRequired: boolean };
  session: {
    id: string; status: string; attemptNumber: number; startedAt: string | null; submittedAt: string | null;
    mentee: { id: string; name: string; avatarUrl: string | null } | null;
  } | null;
  proctor: {
    snapshots: { url: string; at: string }[];
    flags: { type: string; at: string; meta: Record<string, unknown> }[];
    flagCounts: Record<string, number>;
  };
  items: ReviewItem[];
  totals: { totalPossible: number; totalAwarded: number; gradedCount: number; questionCount: number };
  canReview: boolean;
}

export default interviewApi;
