const { SystemRoles } = require('librechat-data-provider');

const SHARED_ADMIN_MEMORY_ID = 'admin_shared_memory';

function getMemoryUserId(user) {
  if (user.role === SystemRoles.ADMIN) {
    return SHARED_ADMIN_MEMORY_ID;
  }
  return user.id;
}

module.exports = { getMemoryUserId, SHARED_ADMIN_MEMORY_ID };
