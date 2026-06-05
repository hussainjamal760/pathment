# Authorization — Scoped RBAC (IAM)

**What it is:** a Google/GitHub-style permission system where a user holds **roles bound to
a scope** (org → program → clan → self), and a check asks *"does any held role grant this
permission at a scope that covers this resource?"* Default-deny.

**Why it exists:** plain role checks can't express "a co-mentor may review tasks **only in
their clan**" or "an admin scoped to **one program**." Authorization here has two
dimensions — *what* you can do (permission) and *what you can do it on* (scope).

## Data model
`RoleAssignment` (userId, role, scopeType `org|program|clan|self`, scopeId) — explicit
grants. `CustomRole` (admin-defined permission bundles). Derived grants come from
`User.capabilities`, `ClanMembership.role`, and `CrossClanAssignment`. See migration 044/045.

## Backend
- **Catalog:** `config/permissions.js` (the permission vocabulary), `config/roles.js` (built-in roles → permission bundles).
- **Built-in roles:** `super_admin` (org, all), `program_admin` (program), `intake_manager`, `people_admin`, `moderator`, `analyst` (org); `lead_mentor`, `co_mentor`, `core_team` (clan); `mentee` (self). Plus admin-defined **custom roles**.
- **Engine:** `authzService` — `getAssignments(user)` (union of derived + explicit), `can(user, permission, resource)`, `getPermissionUnion(user)` (any-scope, for UI), `hasAdminAccess(user)` (org/program admin-tier), scope resolvers.
- **Enforcement:** `requirePermission(perm, scopeResolver?)` middleware on routes; `can()` inside services. Server is the source of truth.
- **Admin API** (`/api/access`, gated `access.manage`): `GET /me/permissions` (any user — drives UI), `/roles`, `/users/:id`, `POST /grants`, `DELETE /grants/:id`, `POST /invites` (invite a new person with a role pre-assigned), `custom-roles` CRUD.

## Frontend
- `usePermissions()` / `useCan()` + `<PermissionGuard>` (UX gating; server still enforces). `canAccessAdmin` lets org/program admins enter `/admin/*` even without the `admin` capability; the admin nav is permission-filtered; `/admin` index lands them on their first allowed section.
- **Roles & Access page** (`/admin/access`): People tab (search a user → see granted + derived roles → grant/revoke at a scope → **invite someone with a role**), and Custom Roles tab (build permission bundles).

## Role flows
- **Admin (super_admin):** grants scoped roles, invites teammates with a role pre-assigned, builds custom roles, sees everything.
- **Sub-role admin** (e.g. `intake_manager`, `program_admin`): reaches only their part of the admin area (nav filtered, landing chosen for them); enforced per request.
- **Lead mentor:** holds `clan.manage_members` on their clan → adds co-mentors/core-team via the [Clan Team](./programs-cohorts-clans.md) page (clan membership = the grant).
- **Co-mentor / Core team / Mentee:** clan-/self-scoped permissions only.

## Rules & edge cases
- Org scope covers everything beneath it; program covers its programId; clan its clanId; self the matching user.
- A clan-role permission (e.g. `analytics.view` held by a lead mentor) does **not** grant admin-area access — only org/program admin-tier roles do.
- Custom roles are merged into the engine via an in-memory cache, invalidated on change.
- Most routes already moved from `authorize([role])` to `requirePermission`; mixed mentor+admin and self routes stay role-based by design.

## Related
[Authentication](./authentication.md) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md) (delegation via clan membership) · [Intake & Assessments](./intake-and-assessments.md)
