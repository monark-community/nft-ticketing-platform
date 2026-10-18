import 'dotenv/config';
import app from './app';
import { startBlockchainListener } from './workers/blockchain.listener';
import logger from './lib/logger';
import { prisma } from './lib/prisma';

const PORT = process.env.PORT || process.env.API_PORT || 3001;

app.listen(PORT, () => {
  logger.info(`NFTicketPass API running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Database health: http://localhost:${PORT}/db-health`);
  startBlockchainListener();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
