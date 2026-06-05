# Authentication

**What it is:** how people sign in and prove who they are — JWT-based login with refresh
tokens, optional 2FA, email verification, password reset, and **invite-based registration**.

**Why it exists:** the platform is invite-/application-driven (you don't sign up off the
street), so auth is tightly coupled to placement: registering consumes an invite that
already says which program/clan/role you join.

## Data model
`User` (identity, `role`, `capabilities[]`, `status`, `emailVerified`), `MentorProfile` /
`MenteeProfile` / `AdminProfile` (one-to-one role data), `RefreshToken`,
`EmailVerificationToken`, `PasswordResetToken`, `UserSession`, `TwoFactorAuth`,
`RegistrationInvite` (email-bound; carries `programId`/`clanId`/`cohortId` + optional
`metadata.pendingGrants`). See [DATABASE.md §3–4](../DATABASE.md).

## Backend
Service: `authService`. Routes (`/api/auth`, public unless noted):
- `POST /register` — consumes an invite token; creates `User` + role profile + `UserSettings`; marks email pre-verified (the invite proves it); for mentees creates `Enrollment` (+ `ClanMembership` if the invite names a clan); applies any `pendingGrants` (see [Authorization](./authorization-rbac.md)); links the originating `Application`.
- `POST /login` — verifies bcrypt password; if 2FA on, returns a 5-min temp token + `requiresTwoFactor`; else issues access + refresh JWT.
- `POST /refresh` · `POST /verify-email` · `POST /resend-verification` · `POST /forgot-password` · `POST /reset-password` · `GET /invites/:token` (invite preview, returns program/clan + applicant name for prefill).
- Protected: `GET /me`, `POST /change-password`, `POST /logout`, 2FA setup/verify/disable.

**Middleware:** `authenticate` (verifies JWT, loads user, checks active + email-verified) and `authorize([roles])` (capability-aware — passes if any of the user's `capabilities` match). Authorization beyond role is handled by [Scoped RBAC](./authorization-rbac.md).

## Frontend
`app/(auth)/login`, `/register` (reads `?invite=`, prefills name/email), `/verify-email`,
`/reset-password`, `/forgot-password`. `lib/context/AuthContext` holds the session
(`user`, `activeRole`, `capabilities`) in localStorage; `api-client` attaches the JWT and
auto-refreshes on 401. `RoleGuard` gates role sections.

## Role flows
- **Everyone:** open the emailed invite/apply link → `/register?invite=…` (email locked, name prefilled from the application) → set password → land on their role dashboard. Returning users log in (+ 2FA code if enabled).
- **Admin:** additionally can require email verification, suspend/unsuspend users, and manage capabilities (see [Authorization](./authorization-rbac.md) / user management).
- **Mentor / Mentee:** identical sign-in; their `capabilities` decide which sections they can open.

## Rules & edge cases
- Registration is **invite-only**; an invite is email-bound and one-time (`usedAt`).
- Email is auto-verified on invite registration (the invite was sent to that address).
- Refresh tokens are DB-backed and revoked on logout/password reset.
- `capabilities` is always a superset of `role`, so one account can hold several views (e.g. mentee + admin).

## Related
[Authorization (RBAC)](./authorization-rbac.md) · [Intake & Assessments](./intake-and-assessments.md) · [Notifications & Email](./notifications-and-email.md) (transactional mail)
