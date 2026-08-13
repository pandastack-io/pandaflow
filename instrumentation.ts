/**
 * Next.js instrumentation hook — runs once on server startup (both dev and prod).
 * Validates required environment and ensures the default seed organisation
 * exists before any request is served. seedDatabase() is a no-op when the row
 * already exists.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const key = process.env.PANDASTACK_API_KEY?.trim();
    if (!key) {
      throw new Error(
        [
          '',
          'PANDASTACK_API_KEY is not set.',
          '',
          'PandaFlow executes workflow nodes in PandaStack microVMs and cannot',
          'start without an API key. Add to .env.local:',
          '',
          '  PANDASTACK_API_KEY=pds_...   (from https://pandastack.ai → API Tokens)',
          '',
          'For fully offline development without real sandboxes, opt in to the',
          'mock provider explicitly:',
          '',
          '  PANDASTACK_API_KEY=mock-api-key',
          '',
        ].join('\n')
      );
    }
    const { seedDatabase } = await import('@/lib/db/seed');
    await seedDatabase();
  }
}
