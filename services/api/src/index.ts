import express, { Express, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
// default port (3001) is the same as api port in docker-compose.yml
const port = process.env.API_PORT || 3001; 
const prisma = new PrismaClient();

app.use(express.json());

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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: String(error)
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

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Database health: http://localhost:${port}/db-health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
