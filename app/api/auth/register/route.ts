import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, organizationMembers, organizations, users } from '@/lib/db/schema';
import { buildDefaultOrganization } from '@/lib/auth/organization';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
  email: z.email('Invalid email address').transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with that email already exists.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const createdUser = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        name,
        email,
        emailVerified: new Date(),
      }).returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

      await tx.insert(accounts).values({
        userId: user.id,
        type: 'credentials',
        provider: 'credentials',
        providerAccountId: user.id,
        access_token: passwordHash,
      });

      const organization = buildDefaultOrganization({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      const [createdOrganization] = await tx.insert(organizations).values(organization).returning({ id: organizations.id });

      await tx.insert(organizationMembers).values({
        organizationId: createdOrganization.id,
        userId: user.id,
        role: 'owner',
      });

      return user;
    });

    return NextResponse.json(
      {
        success: true,
        user: createdUser,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
