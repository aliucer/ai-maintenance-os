import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('[SEED] Seeding database...');

    // Create test tenant
    const tenant = await prisma.tenant.upsert({
        where: { id: 'a0000000-0000-0000-0000-000000000001' },
        update: {},
        create: {
            id: 'a0000000-0000-0000-0000-000000000001',
            name: 'Demo Property Management',
        },
    });
    console.log(`[OK] Tenant: ${tenant.name} (${tenant.id})`);

    // Create test building
    const building = await prisma.building.upsert({
        where: { id: 'b0000000-0000-0000-0000-000000000001' },
        update: {},
        create: {
            id: 'b0000000-0000-0000-0000-000000000001',
            tenantId: tenant.id,
            name: 'HQ Building',
            address: '123 Main Street',
        },
    });
    console.log(`[OK] Building: ${building.name} (${building.id})`);

    // Create test unit
    const unit = await prisma.unit.upsert({
        where: { id: 'c0000000-0000-0000-0000-000000000002' },
        update: {},
        create: {
            id: 'c0000000-0000-0000-0000-000000000002',
            tenantId: tenant.id,
            buildingId: building.id,
            unitNumber: '101',
        },
    });
    console.log(`[OK] Unit: ${unit.unitNumber} (${unit.id})`);

    console.log('[SEED] Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
