/**
 * Server-side helper to get the current user's organization ID from session.
 * Falls back to the default seed org when SKIP_AUTH=true (local dev without login).
 */
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { organizationMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';

export async function getSessionOrgId(): Promise<string | null> {
  // Dev bypass — SKIP_AUTH=true uses the seed org
  if (process.env.SKIP_AUTH === 'true') {
    return DEFAULT_ORGANIZATION_ID;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, session.user.id))
    .limit(1);

  return membership?.organizationId ?? null;
}

/** Throws a 401 Response if no org can be resolved. Use in route handlers. */
export async function requireOrgId(): Promise<string> {
  const orgId = await getSessionOrgId();
  if (!orgId) {
    throw new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return orgId;
}
