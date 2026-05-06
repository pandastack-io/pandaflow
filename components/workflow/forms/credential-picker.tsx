'use client';

import { useEffect, useState } from 'react';
import { Key, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { credentialProviders } from '@/lib/credentials/providers';
import { cn } from '@/lib/utils';

interface CredentialPickerProps {
  /** The credential provider id (e.g. 'openai', 'anthropic') */
  providerId: string;
  /** Current config values from the node */
  config: Record<string, unknown>;
  /** Called when user picks/changes credential */
  onChange: (updates: Record<string, string>) => void;
  /** Label to show above the picker */
  label?: string;
}

type Secret = { id: string; name: string; type: string };

export function CredentialPicker({ providerId, config, onChange, label }: CredentialPickerProps) {
  void config;
  void onChange;

  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const provider = credentialProviders.find((item) => item.id === providerId);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/secrets')
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setSecrets(data.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!provider) return null;

  const requiredFields = provider.fields.filter((field) => field.required !== false);
  const connected = requiredFields.every((field) => secrets.some((secret) => secret.name === field.key));

  return (
    <div className="space-y-2">
      {label ? <label className="text-xs font-medium text-[var(--color-foreground)]">{label}</label> : null}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
          connected
            ? 'border-green-500/30 bg-green-500/5 text-green-400'
            : 'border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
        )}
      >
        {connected ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
        <span className="flex-1">
          {loading ? 'Loading...' : connected ? `${provider.name} connected` : `${provider.name} not configured`}
        </span>
        <a
          href="/secrets"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 transition-colors hover:text-[var(--color-foreground)]"
          title="Manage credentials"
        >
          <Key className="h-3 w-3" />
          {!connected ? <span>Configure</span> : null}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {!connected && !loading ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Add your {provider.name} credentials in{' '}
          <a href="/secrets" target="_blank" rel="noreferrer" className="underline hover:text-[var(--color-foreground)]">
            Secrets
          </a>{' '}
          to use this node.
        </p>
      ) : null}
    </div>
  );
}
