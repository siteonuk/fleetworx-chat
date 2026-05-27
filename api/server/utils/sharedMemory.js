const mongoose = require('mongoose');
const { SystemRoles } = require('librechat-data-provider');

async function getAdminUserIds() {
  const User = mongoose.models.User;
  const admins = await User.find({ role: SystemRoles.ADMIN }, { _id: 1 }).lean();
  return admins.map((a) => a._id);
}

function getMemoryUserId(user) {
  return user.id;
}

async function getMemoryQueryFilter(user) {
  if (user.role === SystemRoles.ADMIN) {
    const adminIds = await getAdminUserIds();
    return { userId: { $in: adminIds } };
  }
  return { userId: user.id };
}

module.exports = { getMemoryUserId, getMemoryQueryFilter, getAdminUserIds };
