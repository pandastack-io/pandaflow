import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';

const ORG_ID = '00000000-0000-0000-0000-000000000000';

function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const secret = randomBytes(32).toString('hex');
  const fullKey = `sk-${secret}`;
  const prefix = fullKey.slice(0, 10);
  const hash = createHash('sha256').update(fullKey).digest('hex');
  return { fullKey, prefix, hash };
}

export async function GET() {
  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.organizationId, ORG_ID), eq(apiKeys.isActive, true)))
      .orderBy(desc(apiKeys.createdAt));

    return NextResponse.json({ success: true, data: keys });
  } catch (error) {
    console.error('Failed to list API keys:', error);
    return NextResponse.json({ success: false, error: 'Failed to list API keys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, scopes = [], expiresAt } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const { fullKey, prefix, hash } = generateApiKey();

    const [newKey] = await db.insert(apiKeys).values({
      organizationId: ORG_ID,
      name: name.trim(),
      keyPrefix: prefix,
      keyHash: hash,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    });

    return NextResponse.json({
      success: true,
      data: { ...newKey, fullKey },
    });
  } catch (error) {
    console.error('Failed to create API key:', error);
    return NextResponse.json({ success: false, error: 'Failed to create API key' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, ORG_ID)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke API key:', error);
    return NextResponse.json({ success: false, error: 'Failed to revoke API key' }, { status: 500 });
  }
}
