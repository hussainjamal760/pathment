const { AuthenticationError, AuthorizationError } = require('../utils/errors/errorTypes');
const { verifyAccessToken } = require('../utils/jwt');
const { catchAsync } = require('./errorHandler');
const { models } = require('../db');

/**
 * Authenticate user with JWT
 */
const authenticate = catchAsync(async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('No token provided. Please log in to access this resource');
  }

  const token = authHeader.split(' ')[1];

  // Verify token
  const decoded = verifyAccessToken(token);

  // Get user from database
  const user = await models.User.findByPk(decoded.id, {
    attributes: { exclude: ['password'] }
  });

  if (!user) {
    throw new AuthenticationError('User no longer exists');
  }

  if (user.status !== 'active') {
    throw new AuthenticationError('Your account has been disabled');
  }

  if (!user.emailVerified) {
    throw new AuthenticationError('Please verify your email before logging in');
  }

  // Attach user to request
  req.user = user;
  next();
});

/**
 * Authorize user by role
 * @param {Array<String>} roles - Allowed roles
 */
const authorize = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    console.log('Authorize middleware - Roles allowed:', allowedRoles, 'User role:', req.user?.role);
    
    if (!req.user) {
      throw new AuthenticationError('You must be logged in to access this resource');
    }
    console.log('User is authenticated with role:', req.user.role);
    if (!allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError(`This resource is only accessible to ${allowedRoles.join(', ')} users`);
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      
      const user = await models.User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (user && user.status === 'active') {
        req.user = user;
      }
    }
  } catch (error) {
    // Silently fail for optional auth
  }
  
  next();
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth
};
