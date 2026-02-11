import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // SystemAdmin role (bypasses yacht scope)
  const systemAdminRole = await prisma.role.upsert({
    where: { name: 'SystemAdmin' },
    update: {},
    create: { name: 'SystemAdmin' },
  });

  // SystemAdmin user
  const systemAdminPassword = await bcrypt.hash('sysadmin123', 10);
  const systemAdminUser = await prisma.user.upsert({
    where: { email: 'sysadmin@yachtpms.com' },
    update: {},
    create: {
      email: 'sysadmin@yachtpms.com',
      fullName: 'System Administrator',
      passwordHash: systemAdminPassword,
      roleId: systemAdminRole.id,
    },
  });

  // Admin role
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin' },
  });

  // Usuario admin
  const passwordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@yachtpms.com' },
    update: {
      fullName: 'System Admin',
      roleId: adminRole.id,
    },
    create: {
      email: 'admin@yachtpms.com',
      fullName: 'System Admin',
      passwordHash,
      roleId: adminRole.id,
    },
  });

  // Yacht demo
  const demoYacht = await prisma.yacht.upsert({
    where: { id: 'e7c4b3ce-cea9-4127-bbe4-2d092de3cbff' }, // si quieres fijo
    update: { name: 'Demo Yacht', flag: 'EC' },
    create: {
      id: 'e7c4b3ce-cea9-4127-bbe4-2d092de3cbff',
      name: 'Demo Yacht',
      flag: 'EC',
    },
  });

  // Acceso del admin al yacht
  await prisma.userYachtAccess.upsert({
    where: {
      userId_yachtId: {
        userId: adminUser.id,
        yachtId: demoYacht.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      yachtId: demoYacht.id,
    },
  });

  // Captain role
  const captainRole = await prisma.role.upsert({
    where: { name: 'Captain' },
    update: {},
    create: { name: 'Captain' },
  });

  // Captain user
  const captainPassword = await bcrypt.hash('captain123', 10);
  const captainUser = await prisma.user.upsert({
    where: { email: 'captain@yachtpms.com' },
    update: {},
    create: {
      email: 'captain@yachtpms.com',
      fullName: 'Captain John',
      passwordHash: captainPassword,
      roleId: captainRole.id,
    },
  });

  // Captain access to demo yacht
  await prisma.userYachtAccess.upsert({
    where: {
      userId_yachtId: {
        userId: captainUser.id,
        yachtId: demoYacht.id,
      },
    },
    update: {},
    create: {
      userId: captainUser.id,
      yachtId: demoYacht.id,
      roleNameOverride: 'Captain',
    },
  });

  // Chief Engineer role
  const engineerRole = await prisma.role.upsert({
    where: { name: 'Chief Engineer' },
    update: {},
    create: { name: 'Chief Engineer' },
  });

  // Engineer user
  const engineerPassword = await bcrypt.hash('engineer123', 10);
  const engineerUser = await prisma.user.upsert({
    where: { email: 'engineer@yachtpms.com' },
    update: {},
    create: {
      email: 'engineer@yachtpms.com',
      fullName: 'Chief Engineer John',
      passwordHash: engineerPassword,
      roleId: engineerRole.id,
    },
  });

  // Chief Engineer access to demo yacht
  await prisma.userYachtAccess.upsert({
    where: {
      userId_yachtId: {
        userId: engineerUser.id,
        yachtId: demoYacht.id,
      },
    },
    update: {},
    create: {
      userId: engineerUser.id,
      yachtId: demoYacht.id,
      roleNameOverride: 'Chief Engineer',
    },
  });

  // Crew Member role
  const stewardRole = await prisma.role.upsert({
    where: { name: 'Crew Member' },
    update: {},
    create: { name: 'Crew Member' },
  });

  // Steward user
  const stewardPassword = await bcrypt.hash('steward123', 10);
  const stewardUser = await prisma.user.upsert({
    where: { email: 'steward@yachtpms.com' },
    update: {},
    create: {
      email: 'steward@yachtpms.com',
      fullName: 'Crew Member Jane',
      passwordHash: stewardPassword,
      roleId: stewardRole.id,
    },
  });

  // Crew Member access to demo yacht
  await prisma.userYachtAccess.upsert({
    where: {
      userId_yachtId: {
        userId: stewardUser.id,
        yachtId: demoYacht.id,
      },
    },
    update: {},
    create: {
      userId: stewardUser.id,
      yachtId: demoYacht.id,
      roleNameOverride: 'Crew Member',
    },
  });

  // Demo engine
  const demoEngine = await prisma.engine.upsert({
    where: {
      id: 'engine-demo-001',
    },
    update: {},
    create: {
      id: 'engine-demo-001',
      yachtId: demoYacht.id,
      name: 'Main Engine',
      type: 'Diesel',
      serialNo: 'ME-2024-001',
    },
  });

  // Demo logbook entry
  await prisma.logBookEntry.upsert({
    where: {
      yachtId_entryDate: {
        yachtId: demoYacht.id,
        entryDate: new Date('2024-01-15T08:00:00Z'),
      },
    },
    update: {},
    create: {
      yachtId: demoYacht.id,
      entryDate: new Date('2024-01-15T08:00:00Z'),
      watchPeriod: '0800-1200',
      status: 'Draft',
      createdBy: captainUser.id,
    },
  });

  console.log('✅ Seed completed');
  console.log({
    systemAdmin: {
      email: systemAdminUser.email,
      password: 'sysadmin123',
      role: 'SystemAdmin',
    },
    admin: {
      email: adminUser.email,
      password: 'admin123',
      role: 'Admin',
      yachtId: demoYacht.id,
    },
    captain: {
      email: captainUser.email,
      password: 'captain123',
      role: 'Captain',
      yachtId: demoYacht.id,
    },
    demoEngine: demoEngine.id,
    demoYacht: demoYacht.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
