// Mentor Hooks barrel
export { useMentorDashboard } from './useMentorDashboard';
export type { UseMentorDashboardReturn } from './useMentorDashboard';

export { useMentorMentees } from './useMentorMentees';
export type { UseMentorMenteesReturn } from './useMentorMentees';

export { useMenteeDetailPage } from './useMenteeDetailPage';
export type { UseMenteeDetailPageReturn } from './useMenteeDetailPage';

export { useMentorPrograms } from './useMentorPrograms';
export type { UseMentorProgramsReturn } from './useMentorPrograms';

export { useMentorProgramDetail } from './useMentorProgramDetail';
export type { UseMentorProgramDetailReturn, ProgramDetailTab } from './useMentorProgramDetail';

export { useMentorTasks } from './useMentorTasks';
export type { UseMentorTasksReturn, MentorTaskTab, CustomTaskFormData } from './useMentorTasks';

export { useMentorTaskDetail } from './useMentorTaskDetail';
export type { UseMentorTaskDetailReturn } from './useMentorTaskDetail';

export { useMentorTaskFeedback } from './useMentorTaskFeedback';
export type { UseMentorTaskFeedbackReturn, InlineFeedbackItem } from './useMentorTaskFeedback';

export { useMenteeList } from './useMenteeList';
export type { AssignedMentee } from './useMenteeList';

export { useTaskAssignment } from './useTaskAssignment';

export { useSubmissionReview } from './useSubmissionReview';
export type { Submission } from './useSubmissionReview';

export { useRoadmapTasks } from './useRoadmapTasks';
export type { RoadmapTaskOption } from './useRoadmapTasks';

export { useMentorSettings } from './useMentorSettings';
export type {
  UseMentorSettingsReturn,
  MentorProfileData,
  MentorProfessionalProfile,
  MentorAvailabilitySettings,
  MentorNotificationSettings,
} from './useMentorSettings';
