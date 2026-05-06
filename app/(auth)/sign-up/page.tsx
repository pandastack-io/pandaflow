import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Provision a workspace instantly and start shipping isolated AI agents."
    >
      <SignUpForm />
    </AuthShell>
  );
}
