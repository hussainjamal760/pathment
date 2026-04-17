'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
}

export interface SystemSettings {
  autoApproveEnrollments: boolean;
  allowSelfRegistration: boolean;
  maintenanceMode: boolean;
  requireEmailVerification: boolean;
  maxProgramsPerMentee: number;
}

export interface UserManagementSettings {
  allowMentorSelfAssignment: boolean;
  requireMentorApproval: boolean;
  autoMatchAlgorithm: boolean;
  minMentorExperience: number;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  enrollmentAlerts: boolean;
  systemAlerts: boolean;
  weeklyReports: boolean;
  urgentIssues: boolean;
}

const DEFAULT_PROFILE: ProfileData = { firstName: '', lastName: '', email: '', phone: '', bio: '' };

const DEFAULT_SYSTEM: SystemSettings = {
  autoApproveEnrollments: false,
  allowSelfRegistration: true,
  maintenanceMode: false,
  requireEmailVerification: true,
  maxProgramsPerMentee: 3,
};

const DEFAULT_USER_MGMT: UserManagementSettings = {
  allowMentorSelfAssignment: false,
  requireMentorApproval: true,
  autoMatchAlgorithm: true,
  minMentorExperience: 2,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  emailNotifications: true,
  enrollmentAlerts: true,
  systemAlerts: true,
  weeklyReports: true,
  urgentIssues: true,
};

interface UseAdminSettingsReturn {
  loading: boolean;
  saving: boolean;
  profileData: ProfileData;
  systemSettings: SystemSettings;
  userManagementSettings: UserManagementSettings;
  notificationSettings: NotificationSettings;
  setProfileData: React.Dispatch<React.SetStateAction<ProfileData>>;
  setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  setUserManagementSettings: React.Dispatch<React.SetStateAction<UserManagementSettings>>;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  handleProfileUpdate: () => Promise<void>;
  handleSystemSettingsUpdate: () => Promise<void>;
  handleUserManagementUpdate: () => Promise<void>;
  handleNotificationUpdate: () => Promise<void>;
}

export function useAdminSettings(): UseAdminSettingsReturn {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileData, setProfileData] = useState<ProfileData>(DEFAULT_PROFILE);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SYSTEM);
  const [userManagementSettings, setUserManagementSettings] = useState<UserManagementSettings>(DEFAULT_USER_MGMT);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(apiConfig.endpoints.profile);
      const data = (response as { data?: ProfileData }).data ?? (response as ProfileData);
      setProfileData({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        bio: data.bio || '',
      });
    } catch (err: unknown) {
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
    try {
      setSaving(true);
      await apiClient.put(apiConfig.endpoints.profile, profileData);
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      console.error('Failed to update profile:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }, [profileData, refreshUser]);

  const handleSystemSettingsUpdate = useCallback(async () => {
    try {
      setSaving(true);
      // TODO: Implement system settings API
      toast.success('System settings updated successfully');
    } catch (err: unknown) {
      console.error('Failed to update system settings:', err);
      toast.error('Failed to update system settings');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleUserManagementUpdate = useCallback(async () => {
    try {
      setSaving(true);
      // TODO: Implement user management settings API
      toast.success('User management settings updated successfully');
    } catch (err: unknown) {
      console.error('Failed to update user management:', err);
      toast.error('Failed to update user management settings');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleNotificationUpdate = useCallback(async () => {
    try {
      setSaving(true);
      // TODO: Implement notification settings API
      toast.success('Notification settings updated successfully');
    } catch (err: unknown) {
      console.error('Failed to update notifications:', err);
      toast.error('Failed to update notification settings');
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    loading,
    saving,
    profileData,
    systemSettings,
    userManagementSettings,
    notificationSettings,
    setProfileData,
    setSystemSettings,
    setUserManagementSettings,
    setNotificationSettings,
    handleProfileUpdate,
    handleSystemSettingsUpdate,
    handleUserManagementUpdate,
    handleNotificationUpdate,
  };
}
