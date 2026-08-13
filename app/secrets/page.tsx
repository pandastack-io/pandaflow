'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { MainLayout } from '@/components/layouts/main-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BrandIcon } from '@/components/ui/brand-icon';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  credentialCategories,
  credentialProviderMap,
  credentialProviders,
  type CredentialCategory,
  type CredentialField,
  type CredentialProvider,
} from '@/lib/credentials/providers';
import { getProviderIcon, getProviderHex } from '@/lib/credentials/brand-icons';
import { cn } from '@/lib/utils';

type SecretSummary = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  createdAt: string;
};

type CategoryFilter = 'All' | CredentialCategory;
type DialogMode = 'create' | 'edit';

type SecretsResponse = {
  success: boolean;
  data?: SecretSummary[];
  error?: string;
};

const MASKED_VALUE = '••••••••';
const ALL_CATEGORIES: CategoryFilter[] = ['All', ...credentialCategories];

function getFieldDefaultValue(field: CredentialField) {
  if (field.key === 'AWS_REGION') return 'us-east-1';
  return '';
}

function getRequiredFields(provider: CredentialProvider) {
  return provider.fields.filter((field) => field.required !== false);
}

function matchesSearch(provider: CredentialProvider, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [provider.name, provider.description, provider.category, ...provider.fields.map((field) => field.label)]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function getDocsLabel(provider: CredentialProvider) {
  if (!provider.docsUrl) return null;

  try {
    return new URL(provider.docsUrl).hostname.replace(/^www\./, '');
  } catch {
    return provider.docsUrl;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export default function SecretsPage() {
  const { toast } = useToast();
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/secrets');
      const result = await readJson<SecretsResponse>(response);

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load credentials');
      }

      setSecrets(result.data ?? []);
    } catch (error) {
      toast({
        title: 'Unable to load credentials',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSecrets();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSecrets]);

  const secretsByName = useMemo(() => new Map(secrets.map((secret) => [secret.name, secret])), [secrets]);

  const selectedProvider = selectedProviderId ? credentialProviderMap[selectedProviderId] : null;
  const deleteProvider = deleteProviderId ? credentialProviderMap[deleteProviderId] : null;

  const isProviderConnected = useCallback(
    (provider: CredentialProvider) => getRequiredFields(provider).every((field) => secretsByName.has(field.key)),
    [secretsByName]
  );

  const getProviderSecrets = useCallback(
    (provider: CredentialProvider) => provider.fields.map((field) => secretsByName.get(field.key)).filter(Boolean) as SecretSummary[],
    [secretsByName]
  );

  const getConfiguredCount = useCallback(
    (provider: CredentialProvider) => provider.fields.filter((field) => secretsByName.has(field.key)).length,
    [secretsByName]
  );

  const openProviderDialog = useCallback(
    (provider: CredentialProvider, mode: DialogMode) => {
      setSelectedProviderId(provider.id);
      setDialogMode(mode);
      setVisiblePasswords({});
      setFormValues(
        Object.fromEntries(
          provider.fields.map((field) => {
            const existing = secretsByName.get(field.key);
            if (mode === 'edit' && existing) return [field.key, MASKED_VALUE];
            return [field.key, getFieldDefaultValue(field)];
          })
        )
      );
    },
    [secretsByName]
  );

  const closeDialog = () => {
    setSelectedProviderId(null);
    setVisiblePasswords({});
    setFormValues({});
    setSaving(false);
  };

  const filteredProviders = useMemo(
    () =>
      credentialProviders.filter(
        (provider) =>
          provider.id !== 'pandastack' &&
          matchesSearch(provider, searchQuery) &&
          (activeCategory === 'All' || provider.category === activeCategory)
      ),
    [activeCategory, searchQuery]
  );

  const groupedProviders = useMemo(
    () =>
      credentialCategories
        .map((category) => ({
          category,
          providers: filteredProviders.filter((provider) => provider.category === category),
        }))
        .filter((group) => group.providers.length > 0),
    [filteredProviders]
  );

  const pandastackProvider = credentialProviderMap.pandastack;
  const totalConnected = useMemo(
    () => credentialProviders.filter((provider) => isProviderConnected(provider)).length,
    [isProviderConnected]
  );

  const handleSaveCredential = async () => {
    if (!selectedProvider) return;

    setSaving(true);

    try {
      let operations = 0;

      for (const field of selectedProvider.fields) {
        const existing = secretsByName.get(field.key);
        const rawValue = formValues[field.key] ?? '';
        const value = rawValue.trim();
        const required = field.required !== false;
        const unchangedMaskedValue = dialogMode === 'edit' && existing && rawValue === MASKED_VALUE;

        if (unchangedMaskedValue) {
          continue;
        }

        if (!value) {
          if (required && !existing) {
            throw new Error(`${field.label} is required`);
          }

          if (required && existing) {
            throw new Error(`${field.label} is required`);
          }

          if (existing) {
            const deleteResponse = await fetch(`/api/secrets/${existing.id}`, { method: 'DELETE' });
            const deleteResult = await readJson<{ success: boolean; error?: string }>(deleteResponse);
            if (!deleteResponse.ok || !deleteResult.success) {
              throw new Error(deleteResult.error || `Failed to delete ${field.label}`);
            }
            operations += 1;
          }

          continue;
        }

        if (existing) {
          const updateResponse = await fetch(`/api/secrets/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: field.key,
              value: rawValue,
              type: existing.type || 'api_key',
              description: existing.description ?? `${selectedProvider.name} credential`,
            }),
          });
          const updateResult = await readJson<{ success: boolean; error?: string }>(updateResponse);
          if (!updateResponse.ok || !updateResult.success) {
            throw new Error(updateResult.error || `Failed to update ${field.label}`);
          }
          operations += 1;
          continue;
        }

        const createResponse = await fetch('/api/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: field.key,
            value: rawValue,
            type: 'api_key',
            description: `${selectedProvider.name} credential`,
          }),
        });
        const createResult = await readJson<{ success: boolean; error?: string }>(createResponse);
        if (!createResponse.ok || !createResult.success) {
          throw new Error(createResult.error || `Failed to save ${field.label}`);
        }
        operations += 1;
      }

      if (operations === 0) {
        toast({ title: 'No changes to save', description: `Your ${selectedProvider.name} credentials are already up to date.` });
      } else {
        toast({
          title: dialogMode === 'edit' ? 'Credential updated' : 'Credential connected',
          description: `${selectedProvider.name} is ready for workflows.`,
        });
      }

      closeDialog();
      await loadSecrets();
    } catch (error) {
      toast({
        title: 'Unable to save credential',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async () => {
    if (!deleteProvider) return;

    const providerSecrets = getProviderSecrets(deleteProvider);
    if (providerSecrets.length === 0) {
      setDeleteProviderId(null);
      return;
    }

    setDeleting(true);

    try {
      for (const secret of providerSecrets) {
        const response = await fetch(`/api/secrets/${secret.id}`, { method: 'DELETE' });
        const result = await readJson<{ success: boolean; error?: string }>(response);
        if (!response.ok || !result.success) {
          throw new Error(result.error || `Failed to delete ${secret.name}`);
        }
      }

      toast({ title: 'Credential removed', description: `${deleteProvider.name} has been disconnected.` });
      setDeleteProviderId(null);
      await loadSecrets();
    } catch (error) {
      toast({
        title: 'Unable to delete credential',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const renderField = (field: CredentialField) => {
    const value = formValues[field.key] ?? '';
    const showPassword = visiblePasswords[field.key] ?? false;
    const required = field.required !== false;
    const maskedExistingValue = dialogMode === 'edit' && secretsByName.has(field.key) && value === MASKED_VALUE;

    if (field.type === 'select' && field.options?.length) {
      return (
        <div key={field.key} className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {field.label}
            {required ? ' *' : ' (optional)'}
          </label>
          <Select
            value={value}
            onValueChange={(nextValue) => setFormValues((current) => ({ ...current, [field.key]: nextValue }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-foreground">
            {field.label}
            {required ? ' *' : ' (optional)'}
          </label>
          {maskedExistingValue ? <span className="text-xs text-muted-foreground">Leave masked to keep current value</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type={field.type === 'password' ? (showPassword ? 'text' : 'password') : field.type}
            value={value}
            onChange={(event) => setFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
            placeholder={field.placeholder}
            autoComplete="off"
            className="h-11 bg-background/80"
          />
          {field.type === 'password' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setVisiblePasswords((current) => ({
                  ...current,
                  [field.key]: !current[field.key],
                }))
              }
              className="h-11 shrink-0"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="sr-only">Toggle {field.label}</span>
            </Button>
          ) : null}
        </div>
        {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      </div>
    );
  };

  const renderProviderCard = (provider: CredentialProvider) => {
    const connected = isProviderConnected(provider);
    const providerSecrets = getProviderSecrets(provider);
    const configuredCount = getConfiguredCount(provider);
    const hasStoredSecrets = providerSecrets.length > 0;
    const brandIcon = getProviderIcon(provider.simpleIconId ?? provider.id);
    const brandHex = getProviderHex(provider.simpleIconId ?? provider.id);

    return (
      <Card
        key={provider.id}
        className={cn(
          'group relative h-full min-h-40 cursor-pointer overflow-hidden border bg-card/80 transition duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl',
          connected
            ? 'border-emerald-500/60 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_18%,transparent)] ring-1 ring-emerald-500/30'
            : 'border-dashed border-border/80 hover:border-primary/50'
        )}
        onClick={() => openProviderDialog(provider, hasStoredSecrets ? 'edit' : 'create')}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-primary)_10%,transparent),transparent_48%)] opacity-80" />
        <CardContent className="relative flex h-full flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex h-6 items-center text-foreground">
                {brandIcon ? (
                  <BrandIcon icon={brandIcon} hex={brandHex} size={24} branded={true} className="opacity-90" />
                ) : provider.id === 'pandastack' ? (
                  <Zap className="h-6 w-6 text-amber-400" />
                ) : (
                  <span className="text-2xl leading-none">{provider.icon}</span>
                )}
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{provider.name}</div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'border px-2 py-1 text-[11px] font-medium',
                connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-border/80 bg-background/70 text-muted-foreground'
              )}
            >
              {connected ? 'Connected' : `${configuredCount}/${provider.fields.length}`}
            </Badge>
          </div>

          <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{provider.description}</p>

          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
            <Button
              type="button"
              size="sm"
              variant={connected ? 'secondary' : 'outline'}
              className="h-8"
              onClick={(event) => {
                event.stopPropagation();
                openProviderDialog(provider, hasStoredSecrets ? 'edit' : 'create');
              }}
            >
              {connected ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {connected ? 'Edit' : 'Connect'}
            </Button>
            {hasStoredSecrets ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteProviderId(provider.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete {provider.name}</span>
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">{getRequiredFields(provider).length} required</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <MainLayout>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              AES-256-GCM encrypted secrets
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),#2563eb)] text-white shadow-lg shadow-primary/20">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Secrets</h1>
                <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                  Manage API keys and service credentials used in your workflows.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              {totalConnected}/{credentialProviders.length} connected
            </div>
            <Button onClick={() => openProviderDialog(pandastackProvider, getProviderSecrets(pandastackProvider).length > 0 ? 'edit' : 'create')}>
              <Plus className="h-4 w-4" />
              Add Credential
            </Button>
          </div>
        </div>

        <div className="rounded-3xl bg-[linear-gradient(135deg,#1d4ed8,#2563eb_45%,#60a5fa)] p-[1px] shadow-2xl shadow-blue-500/10">
          <div className="rounded-[calc(1.5rem-1px)] border border-white/10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-card)_92%,#0f172a),color-mix(in_srgb,var(--color-card)_98%,black))]">
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl shadow-inner shadow-white/5 backdrop-blur">
                  {pandastackProvider.icon}
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">PandaStack</h2>
                    <Badge className="border border-white/15 bg-white/10 text-white/90 hover:bg-white/10">
                      Required for PandaStack execution
                    </Badge>
                    <Badge
                      className={cn(
                        'border',
                        isProviderConnected(pandastackProvider)
                          ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100'
                          : 'border-white/15 bg-white/10 text-white/75'
                      )}
                    >
                      {isProviderConnected(pandastackProvider) ? 'Connected ✓' : 'Not connected'}
                    </Badge>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-blue-50/85">{pandastackProvider.description}</p>
                  {pandastackProvider.fields[0]?.helpText ? (
                    <p className="mt-3 text-sm text-blue-100/80">{pandastackProvider.fields[0].helpText}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  variant="secondary"
                  className="border border-white/10 bg-white/10 text-white hover:bg-white/15"
                  onClick={() =>
                    openProviderDialog(
                      pandastackProvider,
                      getProviderSecrets(pandastackProvider).length > 0 ? 'edit' : 'create'
                    )
                  }
                >
                  {getProviderSecrets(pandastackProvider).length > 0 ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {getProviderSecrets(pandastackProvider).length > 0 ? 'Edit' : 'Connect'}
                </Button>
                {getProviderSecrets(pandastackProvider).length > 0 ? (
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setDeleteProviderId(pandastackProvider.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-border/70 bg-card/80 shadow-xl shadow-black/5 backdrop-blur">
          <CardHeader className="gap-4 border-b border-border/60 pb-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Credential library</CardTitle>
                <CardDescription>
                  Organize providers by category, search instantly, and connect services in a few clicks.
                </CardDescription>
              </div>
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search providers..."
                  className="h-11 rounded-full border-border/70 bg-background/70 pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as CategoryFilter)}>
              <div className="overflow-x-auto pb-2">
                <TabsList className="h-auto min-w-max gap-2 bg-transparent p-0">
                  {ALL_CATEGORIES.map((category) => (
                    <TabsTrigger
                      key={category}
                      value={category}
                      className="rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-foreground"
                    >
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {ALL_CATEGORIES.map((category) => {
                const groups = category === 'All' ? groupedProviders : groupedProviders.filter((group) => group.category === category);

                return (
                  <TabsContent key={category} value={category} className="mt-6 space-y-8">
                    {loading ? (
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
                        {Array.from({ length: 10 }).map((_, index) => (
                          <div key={index} className="h-40 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
                        ))}
                      </div>
                    ) : groups.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Search className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-semibold">No providers found</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Try a different search or switch categories to browse more integrations.
                        </p>
                      </div>
                    ) : (
                      groups.map((group) => (
                        <section key={group.category} className="space-y-4">
                          {category === 'All' ? (
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <h2 className="text-lg font-semibold text-foreground">{group.category}</h2>
                                <p className="text-sm text-muted-foreground">
                                  {group.providers.filter((provider) => isProviderConnected(provider)).length}/{group.providers.length} connected
                                </p>
                              </div>
                              <div className="h-px flex-1 bg-border/70" />
                            </div>
                          ) : null}

                          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                            {group.providers.map(renderProviderCard)}
                          </div>
                        </section>
                      ))
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedProvider)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl border-border/70 bg-card p-0">
          {selectedProvider ? (
            <>
              <DialogHeader className="border-b border-border/60 p-6 pb-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-2xl">
                    {selectedProvider.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl">
                      {dialogMode === 'edit' ? 'Edit' : 'Connect'} {selectedProvider.name}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm leading-6">
                      {selectedProvider.description}
                    </DialogDescription>
                    {selectedProvider.docsUrl ? (
                      <a
                        href={selectedProvider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        Get your API key at {getDocsLabel(selectedProvider)}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 p-6">
                {selectedProvider.fields.map((field) => renderField(field))}

                <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <p>Values are encrypted with AES-256-GCM before they are stored.</p>
                </div>
              </div>

              <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4">
                <Button variant="outline" onClick={closeDialog} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSaveCredential} disabled={saving}>
                  {saving ? 'Saving...' : dialogMode === 'edit' ? 'Save Changes' : 'Save Credential'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteProvider)} onOpenChange={(open) => !open && setDeleteProviderId(null)}>
        <DialogContent className="max-w-md border-border/70 bg-card">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Delete credential?</DialogTitle>
                <DialogDescription className="mt-1">
                  {deleteProvider
                    ? `This will remove ${getProviderSecrets(deleteProvider).length} stored secret${getProviderSecrets(deleteProvider).length === 1 ? '' : 's'} for ${deleteProvider.name}. Workflows using them will need new values.`
                    : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProviderId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProvider} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
