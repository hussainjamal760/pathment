# Notifications & Email

**What it is:** one orchestrator that delivers events as **in-app notifications** and
**emails (Resend)**, governed by a central **notification matrix** and each user's
**preferences** - preferences are checked before any email is sent.

**Why it exists:** the app generates many events; users must control what reaches their
inbox, important things must still arrive, and transactional security mail must always send.

## Data model
`Notification` (userId, type, title, status `unread|read|archived`, actionUrl). `EmailQueue`
(every send is recorded). `UserSettings.emailNotifications` / `pushNotifications` (per-category
booleans), `quietHours`, `notificationFrequency`. See [DATABASE.md §8, §12](../DATABASE.md).

## Backend
- **Matrix:** `config/notificationMatrix.js` - ~26 events, each with a `preferenceKey` and default channels (in-app / email / chat). It also exports `EMAIL_PREFERENCE_CATEGORIES` (the user-toggleable, non-transactional emailable events, grouped). Includes `cross_clan_assigned` - fired when someone is brought in to cover/help another clan.
- **Orchestrator:** `notificationOrchestrator.dispatch({ eventKey, recipients, payload })` - creates the in-app `Notification` (+ live socket `notification:new`) and, for the email channel, sends **only if** `shouldCreateNotification(settings, key, {checkEmail})` allows **and** notification email is enabled. `isNotificationEmailEnabled()` defaults **on when `RESEND_API_KEY` is set** (Resend Pro), off otherwise; explicit `EMAIL_NOTIFICATION_EMAILS_ENABLED=false` overrides.
- **Transactional mail** (password reset, email verification, registration/access invite) bypasses preferences via direct `emailService.sendEmail` - always sends.
- **Email service:** `emailService` (Resend) with per-day global + per-recipient rate limits; logs to `EmailQueue`.
- **Saving prefs:** `PATCH /api/profile/notifications` writes to `emailNotifications` (the field the orchestrator reads - this is what makes the toggles real).

## Frontend
- **Preferences:** shared `components/settings/NotificationPreferencesTab.tsx` (Settings → Notifications, all roles) - **role-aware** per-category email toggles + a master switch; only shows categories that role actually receives, with clear neutral labels. Backed by `lib/config/notificationCategories.ts`.
- **Notification center:** `components/shared/notifications/NotificationsPage.tsx` + the bell drawer - the feed of received notifications (mark read, delete), live via socket.

## Role flows
- **All roles:** the bell shows real-time in-app notifications; Settings → Notifications controls which **emails** you get. Toggling a category genuinely turns its emails on/off.
- Each role only sees the categories relevant to it (e.g. mentor: "a mentee submits work," "ready for sign-off"; mentee: "your submission is reviewed," "a task is assigned to you").

## Rules & edge cases
- **In-app** notifications are always created; **email** is preference-gated (+ master switch + the env enable + the matrix's per-event email flag).
- Only "important" events email (chat/community/nudge are in-app-only by matrix design).
- Quiet hours apply to in-app, not to email (important mail isn't silently dropped).

## Related
[Messaging](./messaging.md) · [Profile & Settings](./profile-skills-settings.md) · [Authentication](./authentication.md) (transactional mail)
