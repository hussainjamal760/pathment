const { requirePermissionMinScope } = require('../../src/middlewares/authz');
const { PERMISSIONS } = require('../../src/config/permissions');
const { AuthorizationError } = require('../../src/utils/errors/errorTypes');

// Provide a way to inject a mock user and assignments
let mockUser = null;
let mockAssignments = [];

jest.mock('../../src/services/authzService', () => ({
  getAssignments: async () => mockAssignments,
  can: async (user, perm, resource, { assignments }) => {
    return assignments.some(a => a.permissions.includes(perm));
  },
  canAtMinScope: async (user, perm, minLevel, { assignments } = {}) => {
    const asgs = assignments || mockAssignments;
    return asgs.some(a => a.permissions.includes(perm));
  }
}));

describe('Messaging Controller (RAG RBAC endpoints)', () => {
  let req, res, next;

  beforeEach(() => {
    mockUser = null;
    mockAssignments = [];
    req = { user: null };
    res = {};
    next = jest.fn();
  });

  const runMiddleware = async (req, res, next) => {
    const middleware = requirePermissionMinScope(PERMISSIONS.MENTEE_MANAGE);
    await middleware(req, res, next);
  };

  it('(c) a plain mentee cannot access the endpoint', async () => {
    req.user = { id: 'u1', role: 'mentee' };
    mockAssignments = [{ permissions: ['community.post'] }]; 
    
    await runMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
    expect(next.mock.calls[0][0].message).toBe('You do not have permission to perform this action');
  });

  it('(a) an admin can access the endpoint', async () => {
    req.user = { id: 'u2', role: 'admin' };
    mockAssignments = [{ permissions: ['mentee.manage', 'system.settings'] }]; 
    
    await runMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(); // Called with no arguments (success)
  });

  it('(b) a co-mentor (mentee base role) can access the endpoint', async () => {
    req.user = { id: 'u3', role: 'mentee' };
    mockAssignments = [{ permissions: ['mentee.manage'] }]; 
    
    await runMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(); // Called with no arguments (success)
  });
});
