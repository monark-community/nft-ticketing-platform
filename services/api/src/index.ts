import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { startBlockchainListener } from './workers/blockchain.listener';
import logger from './lib/logger';
import { prisma } from './lib/prisma';

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3001;

app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value
);

// Security headers
app.use(helmet());

// CORS — allow frontend origin with credentials (cookies)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check
app.get('/db-health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Database connection is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Database health check failed', { error });
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
    });
  }
});

// All API routes
app.use('/api', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

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
