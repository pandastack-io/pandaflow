'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => searchParams.get('callbackUrl') || '/workflows', [searchParams]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      setIsLoading(false);
      setError(result?.error || 'Unable to create your account.');
      return;
    }

    const signInResult = await signIn('credentials', {
      email,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsLoading(false);

    if (signInResult?.error) {
      setError('Account created, but automatic sign-in failed. Please sign in manually.');
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    router.push(signInResult?.url || callbackUrl);
    router.refresh();
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl shadow-black/20">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-white">Create your account</CardTitle>
        <CardDescription className="text-zinc-400">
          Start building open source AI agents in minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name" className="text-zinc-200">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-200">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-200">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-zinc-200">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
              required
            />
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertCircle className="size-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" className="h-11 w-full" disabled={isLoading}>
            {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-zinc-400">
          Already have an account?{' '}
          <Link href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-sky-400 hover:text-sky-300">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
