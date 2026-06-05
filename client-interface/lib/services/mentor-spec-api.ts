import { apiClient } from './api-client';

export interface MentorSpecPrinciple { title: string; body: string }
export interface MentorSpecTime { value: string; label: string }
export interface MentorSpecFaq { q: string; a: string }
export interface MentorSpec {
  intro: string;
  principles: MentorSpecPrinciple[];
  responsibilities: string[];
  conduct: string[];
  time: MentorSpecTime[];
  faqs: MentorSpecFaq[];
}

/** Mentor handbook - admin-authored org doc, read by mentors. */
export const mentorSpecApi = {
  get: () => apiClient.get('/mentor-spec'),
  save: (spec: MentorSpec) => apiClient.put('/mentor-spec', { spec }),
};
