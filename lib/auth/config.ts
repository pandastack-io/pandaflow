import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { and, eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import ResendProvider from 'next-auth/providers/resend';
import { Resend as ResendClient } from 'resend';
import { db } from '@/lib/db';
import { authAdapterSchema } from '@/lib/auth/adapter-schema';
import { buildDefaultOrganization } from '@/lib/auth/organization';
import { accounts, organizationMembers, organizations, users } from '@/lib/db/schema';

const resend = process.env.RESEND_API_KEY ? new ResendClient(process.env.RESEND_API_KEY) : null;

async function sendMagicLinkEmail({
  identifier,
  url,
  provider,
}: {
  identifier: string;
  url: string;
  provider: { from?: string };
}) {
  if (!resend) {
    return;
  }

  await resend.emails.send({
    from: provider.from || 'onboarding@resend.dev',
    to: identifier,
    subject: 'Sign in to AI Agent Builder',
    html: `
      <div style="background:#09090b;padding:32px;font-family:Inter,Arial,sans-serif;color:#fafafa;">
        <div style="max-width:480px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:18px;padding:32px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#a1a1aa;">AI Agent Builder</p>
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Your magic link is ready</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#d4d4d8;">Use the button below to finish signing in to your open source AI agent workspace.</p>
          <a href="${url}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Sign in</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">If you didn’t request this email, you can safely ignore it.</p>
        </div>
      </div>
    `,
    text: `Sign in to AI Agent Builder: ${url}`,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, authAdapterSchema),
  session: {
    strategy: 'jwt',
  },
  providers: [
    Credentials({
      name: 'Email and Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!email || !password) {
          return null;
        }

        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            image: users.avatarUrl,
            passwordHash: accounts.access_token,
          })
          .from(users)
          .leftJoin(
            accounts,
            and(
              eq(accounts.userId, users.id),
              eq(accounts.provider, 'credentials'),
              sql`${accounts.providerAccountId} = ${users.id}::text`
            )
          )
          .where(eq(users.email, email))
          .limit(1);

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
          }),
        ]
      : []),
    ...(process.env.RESEND_API_KEY
      ? [
          ResendProvider({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM || 'onboarding@resend.dev',
            sendVerificationRequest: sendMagicLinkEmail,
          }),
        ]
      : []),
  ],
  callbacks: {
    authorized({ auth }) {
      if (process.env.SKIP_AUTH === 'true') {
        return true;
      }

      return Boolean(auth?.user);
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const [existingMembership] = await db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id))
        .limit(1);

      if (existingMembership || !user.email) {
        return;
      }

      const organization = buildDefaultOrganization({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      await db.transaction(async (tx) => {
        const [createdOrganization] = await tx.insert(organizations).values(organization).returning({ id: organizations.id });
        await tx.insert(organizationMembers).values({
          organizationId: createdOrganization.id,
          userId: user.id,
          role: 'owner',
        });
      });
    },
  },
  pages: {
    signIn: '/sign-in',
  },
});
