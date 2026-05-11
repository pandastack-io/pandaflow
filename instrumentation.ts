/**
 * Next.js instrumentation hook — runs once on server startup (both dev and prod).
 * Used to ensure the default seed organisation exists before any request is served.
 * This is safe to call repeatedly: seedDatabase() is a no-op when the row already exists.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { seedDatabase } = await import('@/lib/db/seed');
    await seedDatabase();
  }
}
