import Link from 'next/link';
import { ReactNode } from 'react';

const features = [
  '🔒 Isolated sandboxes',
  '🤖 160+ node types',
  '⚡ Deploy as agents',
  '🌐 Open source',
];

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative hidden overflow-hidden border-r border-zinc-800 bg-zinc-950 lg:flex">
          <div className="marketing-grid absolute inset-0 opacity-30" />
          <div className="marketing-noise absolute inset-0 opacity-20" />
          <div className="relative flex max-w-xl flex-col justify-between p-12 xl:p-16">
            <div>
              <Link href="/" className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-zinc-300">
                AI Agent Builder
              </Link>
              <div className="mt-10 space-y-6">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Open source</p>
                  <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white xl:text-5xl">
                    Open source AI agent runtime. Isolated by design.
                  </h1>
                </div>
                <p className="max-w-lg text-base leading-7 text-zinc-400">
                  Build, execute, and ship visual AI workflows with durable orchestration, secure sandboxes, and developer-first control.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 text-sm text-zinc-200 shadow-2xl shadow-black/20">
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2 lg:hidden">
              <Link href="/" className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-zinc-300">
                AI Agent Builder
              </Link>
              <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
              <p className="text-sm text-zinc-400">Open source AI agent runtime. Isolated by design.</p>
            </div>
            <div className="space-y-2">
              <h2 className="hidden text-3xl font-semibold tracking-tight text-white lg:block">{title}</h2>
              <p className="text-sm text-zinc-400">{description}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
