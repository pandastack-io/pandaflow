import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { credentials } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/secrets/crypto';
import { requireOrgId } from '@/lib/auth/get-org-id';


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = await requireOrgId();
  try {
    const { id } = await params;
    const [secret] = await db
      .select()
      .from(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.organizationId, orgId)));

    if (!secret) {
      return NextResponse.json({ success: false, error: 'Secret not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: secret.id,
        name: secret.name,
        type: secret.type,
        value: await decrypt(secret.encryptedData, secret.encryptionKeyId),
        description: secret.description,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching secret:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch secret' }, { status: 500 });
  }
}

async function updateSecret(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = await requireOrgId();
  try {
    const { id } = await params;
    const body = await request.json();
    const [existingSecret] = await db
      .select()
      .from(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.organizationId, orgId)));

    if (!existingSecret) {
      return NextResponse.json({ success: false, error: 'Secret not found' }, { status: 404 });
    }

    const nextName = body.name !== undefined ? String(body.name).trim() : existingSecret.name;
    if (!nextName) {
      return NextResponse.json({ success: false, error: 'Secret name cannot be empty' }, { status: 400 });
    }

    const existingSecrets = await db
      .select({ id: credentials.id, name: credentials.name })
      .from(credentials)
      .where(eq(credentials.organizationId, orgId));

    if (
      existingSecrets.some(
        (secret) => secret.id !== id && secret.name.toLowerCase() === nextName.toLowerCase()
      )
    ) {
      return NextResponse.json({ success: false, error: 'A secret with this name already exists' }, { status: 409 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = nextName;
    if (body.type !== undefined) updateData.type = String(body.type).trim() || existingSecret.type;
    if (body.description !== undefined) {
      updateData.description = body.description ? String(body.description).trim() : null;
    }
    if (body.value !== undefined) {
      const { ciphertext, keyId } = await encrypt(String(body.value));
      updateData.encryptedData = ciphertext;
      updateData.encryptionKeyId = keyId;
    }

    const [updatedSecret] = await db
      .update(credentials)
      .set(updateData)
      .where(and(eq(credentials.id, id), eq(credentials.organizationId, orgId)))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updatedSecret.id,
        name: updatedSecret.name,
        type: updatedSecret.type,
        value: await decrypt(updatedSecret.encryptedData, updatedSecret.encryptionKeyId),
        description: updatedSecret.description,
        createdAt: updatedSecret.createdAt,
        updatedAt: updatedSecret.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating secret:', error);
    return NextResponse.json({ success: false, error: 'Failed to update secret' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateSecret(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateSecret(request, context);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = await requireOrgId();
  try {
    const { id } = await params;
    const [deletedSecret] = await db
      .delete(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.organizationId, orgId)))
      .returning({ id: credentials.id });

    if (!deletedSecret) {
      return NextResponse.json({ success: false, error: 'Secret not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { id: deletedSecret.id } });
  } catch (error) {
    console.error('Error deleting secret:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete secret' }, { status: 500 });
  }
}
