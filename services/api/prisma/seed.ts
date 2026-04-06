import { PrismaClient } from '@prisma/client';

// Centralized seed data
const seedData = {
  users: [
    {
      email: 'admin@nfttickets.local',
      username: 'admin',
      walletAddress: '0xAdminWalletAddress1234567890123456789012',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isVerified: true,
    },
    {
      email: 'organizer1@nfttickets.local',
      username: 'organizer1',
      walletAddress: '0xOrganizer1Address1234567890123456789012',
      firstName: 'John',
      lastName: 'Organizer',
      role: 'EVENT_ORGANIZER',
      isVerified: true,
    },
    {
      email: 'organizer2@nfttickets.local',
      username: 'organizer2',
      walletAddress: '0xOrganizer2Address1234567890123456789012',
      firstName: 'Jane',
      lastName: 'Organizer',
      role: 'EVENT_ORGANIZER',
      isVerified: true,
    },
    {
      email: 'customer1@nfttickets.local',
      username: 'customer1',
      walletAddress: '0xCustomer1Address1234567890123456789012',
      firstName: 'Alice',
      lastName: 'Customer',
      role: 'CUSTOMER',
      isVerified: true,
    },
    {
      email: 'customer2@nfttickets.local',
      username: 'customer2',
      walletAddress: '0xCustomer2Address1234567890123456789012',
      firstName: 'Bob',
      lastName: 'Customer',
      role: 'CUSTOMER',
      isVerified: true,
    },
  ],
  events: [
    {
      id: 'event-1',
      title: 'Crypto Concert 2024',
      description: 'A live concert celebrating cryptocurrency and blockchain technology',
      category: 'Concert',
      startDate: new Date('2024-06-15T20:00:00Z'),
      endDate: new Date('2024-06-15T23:00:00Z'),
      location: 'San Francisco, CA',
      maxTickets: 1000,
      pricePerTicket: '99.99',
      status: 'PUBLISHED',
      contractAddress: '0x1234567890123456789012345678901234567890',
    },
    {
      id: 'event-2',
      title: 'NFT Art Expo 2024',
      description: 'Premier digital art exhibition featuring NFT artists',
      category: 'Exhibition',
      startDate: new Date('2024-07-01T10:00:00Z'),
      endDate: new Date('2024-07-05T18:00:00Z'),
      location: 'New York, NY',
      maxTickets: 500,
      pricePerTicket: '149.99',
      status: 'PUBLISHED',
      contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    },
  ],
};

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Seed users
  for (const user of seedData.users) {
    const createdUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
    console.log('Created user:', { email: createdUser.email, role: createdUser.role });
  }

  // Seed events
  for (const event of seedData.events) {
    if (!event.contractAddress) {
      console.error(`Contract address is missing for event: ${event.id}`);
      continue;
    }

    const createdEvent = await prisma.event.upsert({
      where: { id: event.id },
      update: {},
      create: event,
    });
    console.log('Created event:', { id: createdEvent.id, title: createdEvent.title });
  }

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
