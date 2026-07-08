'use strict';

/**
 * Regression guard for the email-notification gate. Covers the master-switch bug:
 * turning email OFF must suppress every event even when stale per-event keys are
 * still `true`; and individual toggles must gate their own event.
 */

const {
  isEmailNotificationEnabled,
  shouldCreateNotification,
} = require('../../src/utils/notificationPreferences');

const withPrefs = (emailNotifications) => ({ emailNotifications });

describe('email notification gate', () => {
  it('master switch OFF blocks every event, even ones still marked true', () => {
    const s = withPrefs({ enabled: false, task_submitted: true, program_updates: true });
    expect(isEmailNotificationEnabled(s, 'task_submitted')).toBe(false);
    expect(isEmailNotificationEnabled(s, 'program_updates')).toBe(false);
    expect(shouldCreateNotification(s, 'task_submitted', { checkEmail: true, checkPush: false, respectQuietHours: false }).should_create).toBe(false);
  });

  it('master ON: an explicitly disabled event is blocked, others send', () => {
    const s = withPrefs({ enabled: true, task_submitted: false, program_updates: true });
    expect(isEmailNotificationEnabled(s, 'task_submitted')).toBe(false); // toggle off → blocked
    expect(isEmailNotificationEnabled(s, 'program_updates')).toBe(true); // toggle on → sends
  });

  it('a missing key defaults to send (opt-out model)', () => {
    const s = withPrefs({ enabled: true });
    expect(isEmailNotificationEnabled(s, 'weekly_progress_report')).toBe(true);
  });

  it('no settings at all → defaults to send', () => {
    expect(isEmailNotificationEnabled(null, 'task_submitted')).toBe(true);
    expect(isEmailNotificationEnabled({}, 'task_submitted')).toBe(true);
  });

  it('master OFF overrides a per-event true (the reported "still getting emails" case)', () => {
    // Exactly what the client saves when a mentor flips the master switch off but
    // the individual rows were left on: enabled:false wins.
    const s = withPrefs({ enabled: false, task_submitted: true, deadline_passed: true, program_updates: true, weekly_progress_report: true });
    for (const ev of ['task_submitted', 'deadline_passed', 'program_updates', 'weekly_progress_report']) {
      expect(isEmailNotificationEnabled(s, ev)).toBe(false);
    }
  });
});
