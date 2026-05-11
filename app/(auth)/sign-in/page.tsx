import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function SignInPage() {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <AuthShell
      title="Sign in"
      description="Access your workflows, secrets, agents, and execution history."
    >
      <Suspense>
        <SignInForm googleEnabled={googleEnabled} />
      </Suspense>
    </AuthShell>
  );
}
