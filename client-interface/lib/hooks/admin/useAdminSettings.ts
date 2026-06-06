'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validateProfileFields } from '@/lib/utils/validation';
import { preferencesApi } from '@/lib/services/preferences-api';
import { toast } from 'sonner';

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

const DEFAULT_PROFILE: ProfileData = { firstName: '', lastName: '', email: '', phone: '', bio: '', city: '', country: '', languages: [], timezone: '' };

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = ((response as any).data ?? response) as any;
      setProfileData({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        bio: data.bio || '',
        city: data.city || '',
        country: data.country || '',
        languages: Array.isArray(data.languages) ? data.languages : [],
        timezone: data.settings?.timezone || '',
      });
      const prefs = data.settings?.preferences;
      if (prefs?.system && typeof prefs.system === 'object') setSystemSettings((prev) => ({ ...prev, ...prefs.system }));
      if (prefs?.userManagement && typeof prefs.userManagement === 'object') setUserManagementSettings((prev) => ({ ...prev, ...prefs.userManagement }));
      if (prefs?.notifications && typeof prefs.notifications === 'object') setNotificationSettings((prev) => ({ ...prev, ...prefs.notifications }));
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
    const invalid = validateProfileFields(profileData);
    if (invalid) { toast.error(invalid); return; }
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
      await preferencesApi.update('system', systemSettings as unknown as Record<string, unknown>);
      toast.success('System settings saved');
    } catch (err: unknown) {
      console.error('Failed to update system settings:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to save system settings'));
    } finally {
      setSaving(false);
    }
  }, [systemSettings]);

  const handleUserManagementUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('userManagement', userManagementSettings as unknown as Record<string, unknown>);
      toast.success('User management settings saved');
    } catch (err: unknown) {
      console.error('Failed to update user management:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to save user management settings'));
    } finally {
      setSaving(false);
    }
  }, [userManagementSettings]);

  const handleNotificationUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('notifications', notificationSettings as unknown as Record<string, unknown>);
      toast.success('Notification settings saved');
    } catch (err: unknown) {
      console.error('Failed to update notifications:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to save notification settings'));
    } finally {
      setSaving(false);
    }
  }, [notificationSettings]);

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
