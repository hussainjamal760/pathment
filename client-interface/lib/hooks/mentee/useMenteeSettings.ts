/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { preferencesApi } from '@/lib/services/preferences-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validateProfileFields } from '@/lib/utils/validation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

export interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  city: string;
  country: string;
  languages: string[];
  timezone: string;
}

export interface MenteeProfileData {
  learningGoals: string;
  interests: string[];
  priorExperience: string;
  currentEducation: string;
  currentOccupation: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

export interface LearningPreferences {
  preferredLearningStyle: string;
  timeCommitment: number;
  preferredSchedule: string;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  taskReminders: boolean;
  mentorMessages: boolean;
  programUpdates: boolean;
  weeklyProgress: boolean;
}

export interface UseMenteeSettingsReturn {
  loading: boolean;
  saving: boolean;
  activeTab: string;
  profileData: ProfileData;
  menteeProfile: MenteeProfileData;
  learningPreferences: LearningPreferences;
  notificationSettings: NotificationSettings;
  setActiveTab: (tab: string) => void;
  setProfileData: React.Dispatch<React.SetStateAction<ProfileData>>;
  setMenteeProfile: React.Dispatch<React.SetStateAction<MenteeProfileData>>;
  setLearningPreferences: React.Dispatch<React.SetStateAction<LearningPreferences>>;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  handleProfileUpdate: () => Promise<void>;
  handleMenteeProfileUpdate: () => Promise<void>;
  handleLearningPreferencesUpdate: () => Promise<void>;
  handleNotificationUpdate: () => Promise<void>;
}

export function useMenteeSettings(): UseMenteeSettingsReturn {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    bio: '',
    city: '',
    country: '',
    languages: [],
    timezone: '',
  });

  const [menteeProfile, setMenteeProfile] = useState<MenteeProfileData>({
    learningGoals: '',
    interests: [],
    priorExperience: '',
    currentEducation: '',
    currentOccupation: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
  });

  const [learningPreferences, setLearningPreferences] = useState<LearningPreferences>({
    preferredLearningStyle: 'visual',
    timeCommitment: 10,
    preferredSchedule: 'flexible',
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    taskReminders: true,
    mentorMessages: true,
    programUpdates: true,
    weeklyProgress: true,
  });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(apiConfig.endpoints.profile);
      const data = response.data;

      setProfileData({
        firstName: data.firstName || '',
        lastName: data.lastName  || '',
        email:     data.email    || '',
        phone:     data.phone    || '',
        bio:       data.bio      || '',
        city:      data.city     || '',
        country:   data.country  || '',
        languages: Array.isArray(data.languages) ? data.languages : [],
        timezone:  data.settings?.timezone || '',
      });

      if (data.menteeProfile) {
        setMenteeProfile({
          learningGoals:     data.menteeProfile.learningGoals     || '',
          interests:         data.menteeProfile.interests         || [],
          priorExperience:   data.menteeProfile.priorExperience   || '',
          currentEducation:  data.menteeProfile.currentEducation  || '',
          currentOccupation: data.menteeProfile.currentOccupation || '',
          linkedinUrl:       data.menteeProfile.linkedinUrl       || '',
          githubUrl:         data.menteeProfile.githubUrl         || '',
          portfolioUrl:      data.menteeProfile.portfolioUrl      || '',
        });
      }

      const prefs = data.settings?.preferences;
      if (prefs?.notifications && typeof prefs.notifications === 'object') {
        setNotificationSettings((prev) => ({ ...prev, ...prefs.notifications }));
      }
      if (prefs?.learning && typeof prefs.learning === 'object') {
        setLearningPreferences((prev) => ({ ...prev, ...prefs.learning }));
      }
    } catch (err: any) {
      console.error('Failed to fetch settings:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleProfileUpdate = useCallback(async () => {
    const invalid = validateProfileFields(profileData);
    if (invalid) { toast.error(invalid); return; }
    try {
      setSaving(true);
      await apiClient.put(apiConfig.endpoints.profile, profileData);
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }, [profileData, refreshUser]);

  const handleMenteeProfileUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await apiClient.post(`${apiConfig.endpoints.profile}/complete-mentee`, menteeProfile);
      toast.success('Mentee profile updated successfully');
      await fetchSettings();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to update mentee profile'));
    } finally {
      setSaving(false);
    }
  }, [menteeProfile, fetchSettings]);

  const handleLearningPreferencesUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('learning', learningPreferences as unknown as Record<string, unknown>);
      toast.success('Learning preferences saved');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to save learning preferences'));
    } finally {
      setSaving(false);
    }
  }, [learningPreferences]);

  const handleNotificationUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('notifications', notificationSettings as unknown as Record<string, unknown>);
      toast.success('Notification settings saved');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to save notification settings'));
    } finally {
      setSaving(false);
    }
  }, [notificationSettings]);

  return {
    loading,
    saving,
    activeTab,
    profileData,
    menteeProfile,
    learningPreferences,
    notificationSettings,
    setActiveTab,
    setProfileData,
    setMenteeProfile,
    setLearningPreferences,
    setNotificationSettings,
    handleProfileUpdate,
    handleMenteeProfileUpdate,
    handleLearningPreferencesUpdate,
    handleNotificationUpdate,
  };
}
