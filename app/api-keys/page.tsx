'use client';

import { MainLayout } from '@/components/layouts/main-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, Trash2, Key, Calendar, Shield, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, format } from 'date-fns';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

const ALL_SCOPES = [
  'workflows:read',
  'workflows:write',
  'workflows:execute',
  'executions:read',
  'secrets:read',
  'templates:read',
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['workflows:read', 'workflows:execute']);
  const [revealedKey, setRevealedKey] = useState<{ id: string; fullKey: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      if (data.success) setKeys(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      const data = await res.json();
      if (data.success) {
        setRevealedKey({ id: data.data.id, fullKey: data.data.fullKey });
        setShowCreate(false);
        setNewKeyName('');
        setNewKeyScopes(['workflows:read', 'workflows:execute']);
        fetchKeys();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any integrations using it will stop working immediately.')) return;
    await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' });
    setKeys(prev => prev.filter(k => k.id !== id));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  return (
    <MainLayout>
      <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-5xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
            <p className="text-muted-foreground mt-1">
              Manage programmatic access to your workflows
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        </div>

        {/* One-time reveal banner */}
        {revealedKey && (
          <Card className="mb-6 border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-green-800 dark:text-green-300 mb-1">
                    API key created — copy it now
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-400 mb-3">
                    This key will not be shown again. Store it securely.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-white dark:bg-black/30 border border-green-300 dark:border-green-700 px-3 py-2 rounded-md break-all">
                      {revealedKey.fullKey}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-green-400"
                      onClick={() => handleCopy(revealedKey.fullKey, 'reveal')}
                    >
                      {copiedId === 'reveal' ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <button onClick={() => setRevealedKey(null)} className="text-green-600 hover:text-green-800 text-lg leading-none">×</button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create form */}
        {showCreate && (
          <Card className="mb-6 border-primary/30">
            <CardHeader>
              <CardTitle className="text-base">New API Key</CardTitle>
              <CardDescription>The key will be shown once after creation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Key Name</label>
                <input
                  type="text"
                  placeholder="e.g., Production Server"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SCOPES.map(scope => (
                    <button
                      key={scope}
                      onClick={() => toggleScope(scope)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        newKeyScopes.includes(scope)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-input text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
                  {creating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Generate Key
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Keys list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Key className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Create your first API key to start integrating.</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create API Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Key</th>
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Scopes</th>
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</th>
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Used</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map(key => (
                    <tr key={key.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Key className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium text-sm">{key.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                            {key.keyPrefix}••••••••••••••••••••
                          </code>
                          <button
                            onClick={() => handleCopy(key.keyPrefix, key.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy prefix"
                          >
                            {copiedId === key.id ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(key.scopes || []).slice(0, 2).map(s => (
                            <Badge key={s} variant="secondary" className="text-xs px-1.5 py-0">{s}</Badge>
                          ))}
                          {(key.scopes || []).length > 2 && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">+{key.scopes.length - 2}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                        </div>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {key.lastUsedAt
                          ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                          : <span className="text-muted-foreground/50">Never</span>}
                      </td>
                      <td className="p-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(key.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Usage docs */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Using API Keys</CardTitle>
            </div>
            <CardDescription>Include your key in the Authorization header</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto font-mono">
{`# Execute a workflow
curl -X POST https://your-domain.com/api/workflows/{id}/execute \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"input": {"key": "value"}}'`}
            </pre>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Keep API keys secret. Never commit them to version control or share them publicly.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}


interface ApiKey {
  id: string;
  name: string;
  key: string;
  created: string;
  lastUsed?: string;
  permissions: string[];
}
