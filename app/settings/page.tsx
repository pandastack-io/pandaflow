'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Save, Trash2, User } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { MainLayout } from '@/components/layouts/main-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  const { data: session, status } = useSession();

  const [settings, setSettings] = useState({
    email: '',
    name: '',
    emailNotifications: true,
    executionAlerts: true,
    errorAlerts: true,
  });

  useEffect(() => {
    if (session?.user) {
      setSettings((prev) => ({
        ...prev,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
      }));
    }
  }, [session]);

  const handleSave = async () => {
    console.log('Saving settings:', settings);
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      console.log('Deleting account...');
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">Manage your account and application settings</p>
        </div>

        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Workspace configuration</CardTitle>
            <CardDescription>Operational settings for integrations and webhooks now live in dedicated pages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">API keys and secrets are managed in the Secrets page.</p>
                <p className="text-sm text-muted-foreground">Store provider credentials, tokens, and reusable variables there.</p>
              </div>
              <Button asChild variant="outline">
                <Link href="/secrets">Go to Secrets</Link>
              </Button>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Webhook configuration is managed in the Webhooks page.</p>
                <p className="text-sm text-muted-foreground">Configure delivery endpoints, signing secrets, and event subscriptions there.</p>
              </div>
              <Button asChild variant="outline">
                <Link href="/webhooks">Go to Webhooks</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <CardTitle>Account Settings</CardTitle>
            </div>
            <CardDescription>Manage your account information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(event) => setSettings({ ...settings, name: event.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(event) => setSettings({ ...settings, email: event.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notification Settings</CardTitle>
            </div>
            <CardDescription>Configure notification preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.emailNotifications}
                  onChange={(event) => setSettings({ ...settings, emailNotifications: event.target.checked })}
                  className="rounded border-input"
                />
                <span className="text-sm">Email Notifications</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.executionAlerts}
                  onChange={(event) => setSettings({ ...settings, executionAlerts: event.target.checked })}
                  className="rounded border-input"
                />
                <span className="text-sm">Execution Completion Alerts</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.errorAlerts}
                  onChange={(event) => setSettings({ ...settings, errorAlerts: event.target.checked })}
                  className="rounded border-input"
                />
                <span className="text-sm">Error Alerts</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 flex justify-end">
          <Button onClick={handleSave} size="lg">
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </div>

        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
            </div>
            <CardDescription>Irreversible and destructive actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">Delete Account</h3>
                <p className="text-sm text-muted-foreground">Permanently delete your account and all associated data</p>
              </div>
              <Button variant="destructive" onClick={handleDeleteAccount}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
