const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { setAuthTokens } = require('~/server/services/AuthService');
const { findUser, createUser, updateUser } = require('~/models');

const ADMIN_ROLES = ['super_admin', 'company_admin'];
const VALID_ROLES = ['super_admin', 'company_admin', 'company_user', 'manager', 'client_user', 'mid_level_user'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapRole(phpRole) {
  return ADMIN_ROLES.includes(phpRole) ? SystemRoles.ADMIN : SystemRoles.USER;
}

const ssoController = async (req, res) => {
  try {
    const secret = process.env.SSO_SHARED_SECRET;
    if (!secret) {
      logger.error('[ssoController] SSO_SHARED_SECRET is not configured');
      return res.status(500).json({ message: 'SSO is not configured' });
    }

    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'], maxAge: '60s' });
    } catch (err) {
      logger.warn('[ssoController] Invalid or expired SSO token:', err.message);
      return res.status(401).json({ message: 'Invalid or expired SSO token' });
    }

    const { email, name, role } = payload;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Invalid email in token' });
    }

    if (!name || typeof name !== 'string' || name.length > 200) {
      return res.status(400).json({ message: 'Invalid name in token' });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role in token' });
    }

    const mappedRole = mapRole(role);
    let user = await findUser({ email: email.toLowerCase() });

    if (user) {
      const updates = {};
      if (user.name !== name) {
        updates.name = name;
      }
      if (user.role !== mappedRole) {
        updates.role = mappedRole;
      }
      if (Object.keys(updates).length > 0) {
        user = await updateUser(user._id, updates);
      }
    } else {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const userId = await createUser(
        {
          provider: 'sso',
          email: email.toLowerCase(),
          name,
          username: email.toLowerCase(),
          role: mappedRole,
          emailVerified: true,
          password: randomPassword,
        },
        undefined,
        true,
        true,
      );
      user = typeof userId === 'object' ? userId : await findUser({ _id: userId });
    }

    if (!user) {
      logger.error('[ssoController] Failed to find or create user for SSO');
      return res.status(500).json({ message: 'Failed to authenticate user' });
    }

    await setAuthTokens(user._id, res);
    return res.redirect(process.env.DOMAIN_CLIENT);
  } catch (err) {
    logger.error('[ssoController] SSO authentication error:', err);
    return res.status(500).json({ message: 'SSO authentication failed' });
  }
};

module.exports = { ssoController };
