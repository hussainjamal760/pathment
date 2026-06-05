const { models } = require('../db');
const { ROLES, roleGrants } = require('../config/roles');
const { ALL_PERMISSIONS } = require('../config/permissions');

// In-memory cache of admin-defined custom roles (key → { permissions[], scope }).
// Invalidated by accessService whenever a custom role changes.
let _customRoles = null;
async function loadCustomRoles() {
  if (_customRoles) return _customRoles;
  const rows = await models.CustomRole.findAll({ attributes: ['key', 'permissions', 'scopeLevel'] });
  _customRoles = {};
  for (const r of rows) _customRoles[r.key] = { permissions: r.permissions || [], scope: r.scopeLevel };
  return _customRoles;
}
function invalidateCustomRoles() { _customRoles = null; }

// Built-in roles that constitute "admin area" access (org/program tier - NOT
// clan roles like lead_mentor). Used by hasAdminAccess().
const ADMIN_TIER_ROLES = new Set(['super_admin', 'program_admin', 'intake_manager', 'people_admin', 'moderator', 'analyst']);

const roleExists = (key, custom) => Boolean(ROLES[key] || (custom && custom[key]));
const grants = (key, perm, custom) => {
  if (ROLES[key]) return roleGrants(key, perm);
  if (custom && custom[key]) return custom[key].permissions.includes(perm);
  return false;
};

/**
 * Scoped RBAC engine. A user holds roles at scopes; a permission check asks:
 * "does any held role grant permission P at a scope that COVERS this resource?"
 *
 * Assignments come from two places, unioned:
 *   1. DERIVED (no setup needed) - capabilities, clan memberships, cross-clan.
 *   2. EXPLICIT - rows in role_assignments (admin-granted scoped roles).
 *
 * A `resource` descriptor names the ids that locate it in the hierarchy:
 *   { orgWide?, programId?, clanId?, userId? }
 * Scope coverage: org covers everything; program covers its programId; clan
 * covers its clanId; self covers the matching userId. Default deny.
 */
class AuthzService {
  /** All (role, scope) a user holds - derived + explicit, de-duplicated. */
  async getAssignments(user) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = [];
    const seen = new Set();
    const add = (role, scopeType, scopeId = null) => {
      if (!roleExists(role, custom)) return;
      const key = `${role}:${scopeType}:${scopeId || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      assignments.push({ role, scopeType, scopeId });
    };

    // 1a. Capabilities → org/self roles (backward compatible: every admin is a
    // super_admin, every mentee gets self-scope; mentor power is clan-derived).
    const caps = Array.isArray(user.capabilities) && user.capabilities.length ? user.capabilities : [user.role];
    if (caps.includes('admin')) add('super_admin', 'org');
    if (caps.includes('mentee')) add('mentee', 'self', user.id);

    // 1b. Clan memberships → clan-scoped roles (lead_mentor / co_mentor / core_team / mentee).
    const memberships = await models.ClanMembership.findAll({
      where: { userId: user.id, status: 'active' },
      attributes: ['clanId', 'role']
    });
    for (const m of memberships) add(m.role, 'clan', m.clanId);

    // 1c. Cross-clan assignments → co-mentor access to another clan.
    //     Consent-first: only ACCEPTED (active) cover grants access; pending/declined
    //     requests grant nothing until the person accepts.
    if (models.CrossClanAssignment) {
      const cross = await models.CrossClanAssignment.findAll({
        where: { userId: user.id, status: 'active' },
        attributes: ['toClanId']
      });
      for (const c of cross) if (c.toClanId) add('co_mentor', 'clan', c.toClanId);
    }

    // 2. Explicit, admin-granted scoped roles.
    const explicit = await models.RoleAssignment.findAll({
      where: { userId: user.id },
      attributes: ['role', 'scopeType', 'scopeId']
    });
    for (const r of explicit) add(r.role, r.scopeType, r.scopeId);

    return assignments;
  }

  /** Does this assignment's scope cover the given resource descriptor? */
  _covers(assignment, resource) {
    const { scopeType, scopeId } = assignment;
    if (scopeType === 'org') return true;                       // org covers all
    if (!resource) return false;                                // scoped role needs a resource
    if (scopeType === 'program') return resource.programId === scopeId;
    if (scopeType === 'clan') return resource.clanId === scopeId;
    if (scopeType === 'self') return resource.userId === scopeId;
    return false;
  }

  /**
   * Core check. `resource` is optional for org-wide actions (e.g. user.manage),
   * which then require an org-scoped grant. Pass `opts.assignments` to reuse a
   * per-request fetch.
   */
  async can(user, permission, resource = null, opts = {}) {
    if (!user) return false;
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    return assignments.some((a) => grants(a.role, permission, custom) && this._covers(a, resource));
  }

  /** The set of permissions the user has for a resource - drives client UI. */
  async getEffectivePermissions(user, resource = null, opts = {}) {
    const custom = await loadCustomRoles();
    const assignments = opts.assignments || (await this.getAssignments(user));
    const granted = new Set();
    for (const perm of ALL_PERMISSIONS) {
      if (assignments.some((a) => grants(a.role, perm, custom) && this._covers(a, resource))) granted.add(perm);
    }
    return [...granted];
  }

  /**
   * The union of permissions a user has at ANY scope - for client UI gating
   * (show/hide nav & buttons) where the exact resource isn't known yet. The
   * server still enforces the precise scoped check on every request.
   */
  async getPermissionUnion(user) {
    if (!user) return [];
    const custom = await loadCustomRoles();
    const assignments = await this.getAssignments(user);
    const granted = [];
    for (const perm of ALL_PERMISSIONS) {
      if (assignments.some((a) => grants(a.role, perm, custom))) granted.push(perm);
    }
    return granted;
  }

  /**
   * Whether the user should be able to enter the admin area at all - i.e. they
   * hold an ORG- or PROGRAM-scoped elevated role (not merely a clan role like a
   * lead mentor). Drives the client's admin entry point + section guard.
   */
  async hasAdminAccess(user) {
    if (!user) return false;
    const caps = Array.isArray(user.capabilities) && user.capabilities.length ? user.capabilities : [user.role];
    if (caps.includes('admin')) return true;
    const custom = await loadCustomRoles();
    const assignments = await this.getAssignments(user);
    return assignments.some((a) =>
      ['org', 'program'].includes(a.scopeType) && (ADMIN_TIER_ROLES.has(a.role) || Boolean(custom[a.role]))
    );
  }

  /** Called by accessService when custom roles change. */
  invalidateCustomRoles() { invalidateCustomRoles(); }

  // ── Scope resolvers (locate a resource in the hierarchy) ─────────────────────
  /** A clan resource: covers clan + its program. */
  async scopeOfClan(clanId) {
    if (!clanId) return null;
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId'] });
    return clan ? { clanId: clan.id, programId: clan.programId } : { clanId };
  }

  /** An assigned task: covers the mentee (self), their clan, and the program. */
  async scopeOfAssignedTask(taskId) {
    const task = await models.AssignedTask.findByPk(taskId, { attributes: ['id', 'menteeId', 'enrollmentId'] });
    if (!task) return null;
    const out = { userId: task.menteeId };
    if (task.enrollmentId) {
      const enr = await models.Enrollment.findByPk(task.enrollmentId, { attributes: ['programId'] });
      if (enr) out.programId = enr.programId;
    }
    const membership = await models.ClanMembership.findOne({
      where: { userId: task.menteeId, status: 'active' }, attributes: ['clanId']
    });
    if (membership) out.clanId = membership.clanId;
    return out;
  }
}

module.exports = new AuthzService();
