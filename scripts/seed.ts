import { seedDatabase } from '../lib/db/seed';

async function main() {
  console.log('🌱 Seeding database...');
  await seedDatabase();
  console.log('✅ Database seeded successfully!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
