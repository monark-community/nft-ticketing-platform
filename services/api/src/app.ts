import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import logger from './lib/logger';
import { prisma } from './lib/prisma';

const app = express();

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
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON' });
    return;
  }
  logger.error(err.message, { stack: err.stack });
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'File exceeds maximum allowed size of 10 MB' });
    return;
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.message?.includes('Unsupported file type')) {
    res.status(400).json({ error: err.message ?? 'Invalid file upload' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
