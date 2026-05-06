import { db } from './index';
import { organizations } from './schema';
import { eq } from 'drizzle-orm';

export async function seedDatabase() {
  try {
    // Check if default organization exists
    const existingOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, '00000000-0000-0000-0000-000000000000'))
      .limit(1);

    if (existingOrg.length === 0) {
      // Create default organization
      await db.insert(organizations).values({
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Default Organization',
        slug: 'default',
        settings: {},
        billingTier: 'free',
        usageQuota: {},
        metadata: {},
      });

      console.log('✅ Default organization created');
    } else {
      console.log('✅ Default organization already exists');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}
