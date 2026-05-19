const cron = require('node-cron');
const { logger } = require('@librechat/data-schemas');
const { deleteNullOrEmptyConversations, deleteOldConversations } = require('~/models');

const CHAT_RETENTION_DAYS = Number(process.env.CHAT_RETENTION_DAYS) || 30;

const cleanup = async () => {
  try {
    await deleteNullOrEmptyConversations();
    await deleteOldConversations(CHAT_RETENTION_DAYS);
  } catch (error) {
    logger.error('[cleanup] Error during app cleanup', error);
  } finally {
    logger.debug('Startup cleanup complete');
  }
};

const startScheduledCleanup = () => {
  cleanup();

  cron.schedule('0 0 * * *', async () => {
    logger.info('[scheduledCleanup] Running daily chat cleanup');
    try {
      await deleteOldConversations(CHAT_RETENTION_DAYS);
    } catch (error) {
      logger.error('[scheduledCleanup] Error during scheduled cleanup', error);
    }
  });

  logger.info('[scheduledCleanup] Daily cleanup cron scheduled at midnight');
};

module.exports = { cleanup, startScheduledCleanup };
