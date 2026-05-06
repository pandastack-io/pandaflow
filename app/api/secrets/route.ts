import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { credentials } from '@/lib/db/schema';
import { encrypt } from '@/lib/secrets/crypto';
import { requireOrgId } from '@/lib/auth/get-org-id';


export async function GET() {
  const orgId = await requireOrgId();
  try {
    const secretList = await db
      .select({
        id: credentials.id,
        name: credentials.name,
        type: credentials.type,
        description: credentials.description,
        createdAt: credentials.createdAt,
      })
      .from(credentials)
      .where(eq(credentials.organizationId, orgId));

    return NextResponse.json({ success: true, data: secretList });
  } catch (error) {
    console.error('Error fetching secrets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch secrets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = await requireOrgId();
  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    const value = String(body.value ?? '');
    const type = String(body.type ?? 'other').trim() || 'other';
    const description = body.description ? String(body.description).trim() : null;

    if (!name || !value) {
      return NextResponse.json({ success: false, error: 'Name and value are required' }, { status: 400 });
    }

    const existingSecrets = await db
      .select({ name: credentials.name })
      .from(credentials)
      .where(eq(credentials.organizationId, orgId));

    if (existingSecrets.some((secret) => secret.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'A secret with this name already exists' }, { status: 409 });
    }

    const { ciphertext, keyId } = await encrypt(value);

    const [secret] = await db
      .insert(credentials)
      .values({
        organizationId: orgId,
        name,
        type,
        encryptedData: ciphertext,
        encryptionKeyId: keyId,
        description,
      })
      .returning({
        id: credentials.id,
        name: credentials.name,
        type: credentials.type,
        description: credentials.description,
        createdAt: credentials.createdAt,
      });

    return NextResponse.json({ success: true, data: secret });
  } catch (error) {
    console.error('Error creating secret:', error);
    return NextResponse.json({ success: false, error: 'Failed to create secret' }, { status: 500 });
  }
}
