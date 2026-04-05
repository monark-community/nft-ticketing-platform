import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import routes from './routes';
import { startBlockchainListener } from './workers/blockchain.listener';
import logger from './lib/logger';  

dotenv.config();

const app: Express = express();
const PORT = process.env.API_PORT || 3001;
const prisma = new PrismaClient();  

// Middleware
// Security headers
app.use(helmet()); 

// CORS - allow frontend origin with credentials (cookies)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
); 

app.use(express.json()); // JSON body parsing
app.use(express.urlencoded({ extended: true })); // URL-encoded body parsing
app.use(cookieParser()); // Cookie parsing

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check endpoint
app.get('/db-health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Database connection is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: String(error),
    });
  }
});

// Get all events
app.get('/api/events', async (_req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      include: {
        organizer: true,
      },
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check endpoint
app.get('/db-health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Database connection is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: String(error),
    });
  }
});

// Get all events
app.get('/api/events', async (_req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      include: {
        organizer: true,
      },
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all users
app.get('/api/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all tickets
app.get('/api/tickets', async (_req: Request, res: Response) => {
  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        event: true,
        owner: true,
      },
    });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all transactions
app.get('/api/transactions', async (_req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        user: true,
        event: true,
        ticket: true,
      },
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get blockchain cache
app.get('/api/blockchain-cache', async (_req: Request, res: Response) => {
  try {
    const cache = await prisma.blockchainCache.findMany({
      include: {
        event: true,
        ticket: true,
        user: true,
      },
    });
    res.json(cache);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// All API routes
app.use('/api', routes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`NFTicketPass API running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Database health: http://localhost:${PORT}/db-health`);
  startBlockchainListener();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  logger.info('API server stopped');
  process.exit(0);
});

export default app;