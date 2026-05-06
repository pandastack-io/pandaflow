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
import { GoogleIcon } from '@/components/auth/google-icon';

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => searchParams.get('callbackUrl') || '/workflows', [searchParams]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsLoading(false);

    if (result?.error) {
      setError('Invalid email or password.');
      return;
    }

    router.push(result?.url || callbackUrl);
    router.refresh();
  }

  async function handleGoogleSignIn() {
    if (!googleEnabled) {
      setError('Google SSO is not configured for this environment.');
      return;
    }

    setError(null);
    setIsGoogleLoading(true);
    await signIn('google', { callbackUrl });
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl shadow-black/20">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-white">Welcome back</CardTitle>
        <CardDescription className="text-zinc-400">
          Sign in with Google or your email and password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
        >
          {isGoogleLoading ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleIcon className="size-4" />}
          Continue with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-zinc-900 px-3 tracking-[0.2em] text-zinc-500">or</span>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            Sign in
          </Button>
        </form>

        <p className="text-center text-sm text-zinc-400">
          Don&apos;t have an account?{' '}
          <Link href={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-sky-400 hover:text-sky-300">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
