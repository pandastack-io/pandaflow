'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { WorkflowEnvVar, WorkflowVariable } from '@/types/nodes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type SecretSummary = { id: string; name: string };

type Props = {
  variables: WorkflowVariable[];
  envVars: WorkflowEnvVar[];
  onChange: (variables: WorkflowVariable[], envVars: WorkflowEnvVar[]) => void;
};

function normalizeSecretReference(value: string) {
  const match = value.match(/^\{\{secret\.([^}]+)\}\}$/);
  return match?.[1] ?? '';
}

export function WorkflowVariablesPanel({ variables, envVars, onChange }: Props) {
  const [secretNames, setSecretNames] = useState<SecretSummary[]>([]);

  useEffect(() => {
    const loadSecrets = async () => {
      try {
        const response = await fetch('/api/secrets');
        const result = await response.json();
        if (result.success) {
          setSecretNames(result.data ?? []);
        }
      } catch {
        setSecretNames([]);
      }
    };

    loadSecrets();
  }, []);

  const availableSecretNames = useMemo(() => secretNames.map((secret) => secret.name), [secretNames]);

  const updateVariable = (index: number, patch: Partial<WorkflowVariable>) => {
    const next = variables.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    onChange(next, envVars);
  };

  const updateEnvVar = (index: number, patch: Partial<WorkflowEnvVar>) => {
    const next = envVars.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    onChange(variables, next);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Variables</CardTitle>
            <CardDescription>Design-time variables available to every node in the workflow.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...variables, { name: '', defaultValue: '', description: '' }], envVars)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Variable
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Default Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No workflow variables defined yet.
                  </TableCell>
                </TableRow>
              ) : (
                variables.map((variable, index) => (
                  <TableRow key={`variable-${index}`}>
                    <TableCell>
                      <Input
                        value={variable.name}
                        placeholder="customerId"
                        onChange={(event) => updateVariable(index, { name: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={String(variable.defaultValue ?? '')}
                        placeholder="default value"
                        onChange={(event) => updateVariable(index, { defaultValue: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={variable.description ?? ''}
                        placeholder="What this variable is used for"
                        onChange={(event) => updateVariable(index, { description: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onChange(variables.filter((_, itemIndex) => itemIndex !== index), envVars)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>Injected into Sandflare sandboxes for every workflow execution.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(variables, [...envVars, { name: '', value: '', isSecret: false }])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Env Var
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Available Secrets</Label>
                <p className="text-sm text-muted-foreground">Reference any secret as <code>{'{{secret.NAME}}'}</code>.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableSecretNames.length > 0 ? (
                  availableSecretNames.map((secretName) => (
                    <Badge key={secretName} variant="secondary">{secretName}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No secrets available yet.</span>
                )}
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value / Secret Reference</TableHead>
                <TableHead className="w-28">Secret</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {envVars.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No environment variables configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                envVars.map((envVar, index) => {
                  const selectedSecret = normalizeSecretReference(envVar.value);
                  return (
                    <TableRow key={`env-${index}`}>
                      <TableCell>
                        <Input
                          value={envVar.name}
                          placeholder="API_BASE_URL"
                          onChange={(event) => updateEnvVar(index, { name: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        {envVar.isSecret ? (
                          <Select
                            value={selectedSecret || undefined}
                            onValueChange={(value) => updateEnvVar(index, { value: `{{secret.${value}}}` })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a secret" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableSecretNames.map((secretName) => (
                                <SelectItem key={secretName} value={secretName}>
                                  {secretName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={envVar.value}
                            placeholder="https://api.example.com"
                            onChange={(event) => updateEnvVar(index, { value: event.target.value })}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={Boolean(envVar.isSecret)}
                            onCheckedChange={(checked) =>
                              updateEnvVar(index, {
                                isSecret: checked,
                                value: checked ? (selectedSecret ? `{{secret.${selectedSecret}}}` : '') : '',
                              })
                            }
                          />
                          <span className="text-sm text-muted-foreground">{envVar.isSecret ? 'On' : 'Off'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onChange(variables, envVars.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
