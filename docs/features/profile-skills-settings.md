# Profile, Skills & Settings

**What it is:** everything a user manages about themselves — profile + location, skills with
proficiency, appearance/theming, role-specific info (mentor availability, mentee learning
prefs), notification preferences, AI keys (mentor/admin), and security (password + 2FA).

**Why it exists:** one consistent, per-role settings surface; collect personal data once and
reuse it (intake carry-forward fills much of it).

## Data model
`User` (name, phone, city, country, languages, bio), `MentorProfile` / `MenteeProfile` (role
data), `Skill` + `UserSkill` (proficiency 1–100), `UserSettings` (theme, colorTheme,
`emailNotifications`/`pushNotifications`, timezone, language, profileVisibility, `preferences`
blob). Migration 039 (location), 040 (theme), 041 (preferences).

## Backend
- **Profile (`/api/profile`):** `GET /`, `PUT /` (name/phone/bio/location), `complete-mentor` / `complete-mentee` (role info), `add-skills` / `skip-skills`, `GET|PATCH /appearance` (theme + accent, cross-device), `PATCH /preferences` (namespaced toggles), **`PATCH /notifications`** (the email-prefs the orchestrator reads — see [Notifications](./notifications-and-email.md)), `PATCH /mentor/availability`.
- **Skills (`/api/skills`):** list/categories/user; create (`system.settings`).

## Frontend
Per-role settings pages (`app/{admin,mentor,mentee}/settings`) built from shared components:
- **Profile** + `LocationDetailsFields` (all roles).
- **Appearance** (`AppearanceTab`) — light/dark/system + per-user accent "vibe" presets (all roles).
- **Skills** (`SkillsTab`, mentor/mentee) — search + add with proficiency, auto-save.
- **Notifications** (`NotificationPreferencesTab`, all roles) — **role-aware** per-category email toggles + master switch.
- **AI Connections** (`AIConnectionsTab`, admin + mentor) — see [AI Integration](./ai-integration.md).
- **Security** (`SecurityTab`, all roles) — change password, 2FA setup/verify/disable; audit logs (admin).
- Role extras: mentor **Availability** (accepting toggle + max mentees), mentee **Learning** (style, weekly hours, schedule), mentor **Info** (title/org/experience/links).

> Removed: the old admin "System Settings" and "User Management" settings tabs were
> non-functional stubs and have been deleted.

## Role flows
- **Admin:** Profile · Appearance · Notifications · AI Connections · Security.
- **Mentor:** Profile · Mentor info · Skills · Appearance · Availability · Notifications · AI Connections · Security.
- **Mentee:** Profile · Learning info · Skills · Appearance · Preferences · Notifications · Security.

## Rules & edge cases
- Appearance persists locally (instant, no-flash) and to the server (cross-device).
- Skills auto-save (debounced); no explicit save button.
- Notification toggles write to `emailNotifications` (the field that actually gates email) and only show categories the role receives.
- Theming is CSS-var based: a centralized `brand` scale + per-user accent presets via `data-accent`; dark mode overrides slate tokens.

## Related
[Notifications & Email](./notifications-and-email.md) · [AI Integration](./ai-integration.md) · [Intake & Assessments](./intake-and-assessments.md) (carry-forward) · [Authentication](./authentication.md) (security/2FA)
