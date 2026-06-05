const { Op } = require('sequelize');
const { models } = require('../db');
const { ROLES } = require('../config/roles');
const { ALL_PERMISSIONS } = require('../config/permissions');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const authzService = require('./authzService');
const notificationOrchestrator = require('./notificationOrchestrator');

const SCOPE_LEVELS = ['org', 'program', 'clan', 'self'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * IAM administration: grant/revoke explicit scoped roles and inspect a user's
 * effective access. Derived assignments (from clan membership / capabilities)
 * are shown read-only; only explicit role_assignments rows are revocable here.
 */
class AccessService {
  /** The role catalog for the admin UI - built-in + custom roles. */
  async listRoleCatalog() {
    const builtIn = Object.entries(ROLES).map(([key, r]) => ({
      key, label: r.label, scope: r.scope, description: r.description,
      permissions: r.permissions === '*' ? '*' : r.permissions, custom: false
    }));
    const custom = await models.CustomRole.findAll({ order: [['label', 'ASC']] });
    const customMapped = custom.map((r) => ({
      key: r.key, label: r.label, scope: r.scopeLevel, description: r.description || '',
      permissions: r.permissions || [], custom: true, id: r.id
    }));
    return [...builtIn, ...customMapped];
  }

  // ── Custom roles ─────────────────────────────────────────────────────────────
  _slugKey(label) {
    const base = 'custom_' + String(label || 'role').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return base === 'custom_' ? 'custom_role' : base;
  }

  _validatePermissions(perms) {
    if (!Array.isArray(perms)) throw new ValidationError('permissions must be an array');
    const unknown = perms.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw new ValidationError(`Unknown permissions: ${unknown.join(', ')}`);
  }

  async listCustomRoles() {
    const rows = await models.CustomRole.findAll({ order: [['label', 'ASC']] });
    return rows.map((r) => r.toJSON());
  }

  async createCustomRole(data, createdBy) {
    if (!data.label || !data.label.trim()) throw new ValidationError('A name is required');
    if (data.scopeLevel && !SCOPE_LEVELS.includes(data.scopeLevel)) throw new ValidationError('Invalid scope level');
    this._validatePermissions(data.permissions || []);

    let key = this._slugKey(data.label);
    // Keep keys unique (and never collide with a built-in role key).
    let i = 2;
    while (ROLES[key] || (await models.CustomRole.findOne({ where: { key } }))) { key = `${this._slugKey(data.label)}_${i++}`; }

    const role = await models.CustomRole.create({
      key, label: data.label.trim(), description: data.description || null,
      scopeLevel: data.scopeLevel || 'org', permissions: data.permissions || [], createdBy
    });
    authzService.invalidateCustomRoles();
    return role;
  }

  async updateCustomRole(id, data) {
    const role = await models.CustomRole.findByPk(id);
    if (!role) throw new NotFoundError('Custom role not found');
    const patch = {};
    if (data.label !== undefined) patch.label = data.label.trim();
    if (data.description !== undefined) patch.description = data.description;
    if (data.scopeLevel !== undefined) {
      if (!SCOPE_LEVELS.includes(data.scopeLevel)) throw new ValidationError('Invalid scope level');
      patch.scopeLevel = data.scopeLevel;
    }
    if (data.permissions !== undefined) { this._validatePermissions(data.permissions); patch.permissions = data.permissions; }
    await role.update(patch);
    authzService.invalidateCustomRoles();
    return role;
  }

  async deleteCustomRole(id) {
    const role = await models.CustomRole.findByPk(id);
    if (!role) throw new NotFoundError('Custom role not found');
    const inUse = await models.RoleAssignment.count({ where: { role: role.key } });
    if (inUse > 0) throw new ValidationError('This role is assigned to users - revoke those grants first');
    await role.destroy();
    authzService.invalidateCustomRoles();
    return { deleted: true };
  }

  async _scopeLabel(scopeType, scopeId) {
    if (scopeType === 'org' || !scopeId) return 'Organization';
    if (scopeType === 'program') {
      const p = await models.Program.findByPk(scopeId, { attributes: ['name'] });
      return p ? `Program: ${p.name}` : 'Program (deleted)';
    }
    if (scopeType === 'clan') {
      const c = await models.Clan.findByPk(scopeId, { attributes: ['name'] });
      return c ? `Clan: ${c.name}` : 'Clan (deleted)';
    }
    if (scopeType === 'self') return 'Self';
    return scopeType;
  }

  /** A user's explicit (revocable) + derived (read-only) assignments. */
  async listUserAccess(userId) {
    const user = await models.User.findByPk(userId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'capabilities']
    });
    if (!user) throw new NotFoundError('User not found');

    const explicitRows = await models.RoleAssignment.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    const explicit = await Promise.all(explicitRows.map(async (r) => ({
      id: r.id, role: r.role, roleLabel: ROLES[r.role]?.label || r.role,
      scopeType: r.scopeType, scopeId: r.scopeId,
      scopeLabel: await this._scopeLabel(r.scopeType, r.scopeId),
      grantedBy: r.grantedBy, createdAt: r.createdAt
    })));

    // Derived assignments (clan membership / capabilities), minus explicit dupes.
    const all = await authzService.getAssignments(user);
    const explicitKeys = new Set(explicit.map((e) => `${e.role}:${e.scopeType}:${e.scopeId || ''}`));
    const derived = await Promise.all(
      all
        .filter((a) => !explicitKeys.has(`${a.role}:${a.scopeType}:${a.scopeId || ''}`))
        .map(async (a) => ({
          role: a.role, roleLabel: ROLES[a.role]?.label || a.role,
          scopeType: a.scopeType, scopeId: a.scopeId,
          scopeLabel: await this._scopeLabel(a.scopeType, a.scopeId)
        }))
    );

    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
      explicit,
      derived
    };
  }

  async grantRole({ userId, role, scopeType = 'org', scopeId = null }, grantedBy) {
    const isCustom = !ROLES[role] && (await models.CustomRole.findOne({ where: { key: role } }));
    if (!ROLES[role] && !isCustom) throw new ValidationError(`Unknown role: ${role}`);
    if (!SCOPE_LEVELS.includes(scopeType)) throw new ValidationError('Invalid scope type');
    if (scopeType !== 'org' && !scopeId) throw new ValidationError(`A ${scopeType} must be selected for this scope`);

    const user = await models.User.findByPk(userId);
    if (!user) throw new NotFoundError('User not found');

    // Validate the scope target exists.
    if (scopeType === 'program' && !(await models.Program.findByPk(scopeId))) throw new ValidationError('Program not found');
    if (scopeType === 'clan' && !(await models.Clan.findByPk(scopeId))) throw new ValidationError('Clan not found');

    const existing = await models.RoleAssignment.findOne({ where: { userId, role, scopeType, scopeId: scopeId || null } });
    if (existing) throw new ConflictError('This role is already assigned at this scope');

    const assignment = await models.RoleAssignment.create({ userId, role, scopeType, scopeId: scopeId || null, grantedBy });

    await models.AuditLog.create({
      userId: grantedBy, action: 'ROLE_GRANTED', entityType: 'RoleAssignment', entityId: assignment.id,
      newValues: { targetUserId: userId, role, scopeType, scopeId }
    }).catch(() => {});

    return assignment;
  }

  async revokeRole(assignmentId, revokedBy) {
    const assignment = await models.RoleAssignment.findByPk(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    const snapshot = { targetUserId: assignment.userId, role: assignment.role, scopeType: assignment.scopeType, scopeId: assignment.scopeId };
    await assignment.destroy();
    await models.AuditLog.create({
      userId: revokedBy, action: 'ROLE_REVOKED', entityType: 'RoleAssignment', entityId: assignmentId, oldValues: snapshot
    }).catch(() => {});
    return { revoked: true };
  }

  /**
   * Invite a not-yet-registered person and pre-assign them a role that's applied
   * automatically when they register. Unlike a placement invite, this carries no
   * program/clan placement - just an account (mentor/mentee base) plus the role
   * grant, stashed in the invite's metadata for authService.register to apply.
   */
  async inviteWithRole({ email, baseRole = 'mentor', role, scopeType = 'org', scopeId = null }, invitedBy) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) throw new ValidationError('A valid email is required');
    if (!['mentor', 'mentee'].includes(baseRole)) throw new ValidationError('Invalid account type');

    const isCustom = !ROLES[role] && (await models.CustomRole.findOne({ where: { key: role } }));
    if (!ROLES[role] && !isCustom) throw new ValidationError(`Unknown role: ${role}`);
    if (!SCOPE_LEVELS.includes(scopeType)) throw new ValidationError('Invalid scope type');
    if ((scopeType === 'program' || scopeType === 'clan') && !scopeId) throw new ValidationError(`A ${scopeType} must be selected`);
    if (scopeType === 'program' && !(await models.Program.findByPk(scopeId))) throw new ValidationError('Program not found');
    if (scopeType === 'clan' && !(await models.Clan.findByPk(scopeId))) throw new ValidationError('Clan not found');

    const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) throw new ConflictError('A user already exists for this email - grant the role to them directly instead');
    const activeInvite = await models.RegistrationInvite.findOne({
      where: { email: normalizedEmail, usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } }
    });
    if (activeInvite) throw new ConflictError('An active invite already exists for this email');

    const rawToken = generateRandomToken();
    const invite = await models.RegistrationInvite.create({
      tokenHash: hashToken(rawToken),
      email: normalizedEmail,
      role: baseRole,
      invitedBy,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      // Applied by authService.register once they sign up.
      metadata: { pendingGrants: [{ role, scopeType, scopeId: scopeId || null }] }
    });

    await models.AuditLog.create({
      userId: invitedBy, action: 'ACCESS_INVITE_CREATED', entityType: 'RegistrationInvite', entityId: invite.id,
      newValues: { email: normalizedEmail, baseRole, role, scopeType, scopeId }
    }).catch(() => {});

    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    const inviteUrl = `${base}/register?invite=${encodeURIComponent(rawToken)}`;
    const emailDelivery = await notificationOrchestrator
      .sendRegistrationInviteEmail({ email: normalizedEmail, role: baseRole, inviteUrl })
      .catch(() => ({ sent: false }));

    return { invite: { id: invite.id, email: normalizedEmail, role: baseRole, expiresAt: invite.expiresAt }, inviteUrl, emailDelivery };
  }
}

module.exports = new AccessService();
