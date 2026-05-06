/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { NodeType } from '@/types/nodes';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NodeFormProps } from './index';
import { CredentialPicker } from './credential-picker';

type SelectOption = { value: string; label: string };

function updateConfig(config: any, onChange: (config: any) => void, key: string, value: any) {
  onChange({ ...config, [key]: value });
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function InterpolationHint() {
  return (
    <p className="text-xs text-muted-foreground">
      String fields support runtime interpolation with <code>{'{{variable}}'}</code> values.
    </p>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: any;
  onChange: (value: number) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(Number(event.target.value || 0))}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex h-10 items-center">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </Field>
  );
}

function JsonEditor({
  label,
  value,
  onValidChange,
  placeholder,
  hint,
  rows = 6,
}: {
  label: string;
  value: any;
  onValidChange: (value: any) => void;
  placeholder: string;
  hint?: string;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError('');
  }, [value]);

  return (
    <Field label={label} hint={hint}>
      <Textarea
        rows={rows}
        value={text}
        onChange={(event) => {
          const nextValue = event.target.value;
          setText(nextValue);
          if (!nextValue.trim()) {
            setError('');
            onValidChange({});
            return;
          }

          try {
            onValidChange(JSON.parse(nextValue));
            setError('');
          } catch {
            setError('Enter valid JSON before saving.');
          }
        }}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </Field>
  );
}

function CommonRequestFields({
  config,
  onChange,
  baseUrlLabel,
  tokenLabel = 'Access token',
  providerId,
}: NodeFormProps & { baseUrlLabel: string; tokenLabel?: string; providerId?: string }) {
  return (
    <Section title="Request settings">
      {providerId ? (
        <CredentialPicker
          providerId={providerId}
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label={baseUrlLabel}
          value={config?.baseUrl || ''}
          onChange={(value) => updateConfig(config, onChange, 'baseUrl', value)}
          placeholder="https://api.example.com"
          hint="Optional override for self-hosted or region-specific endpoints."
        />
        <TextField
          label={tokenLabel}
          value={config?.token || ''}
          onChange={(value) => updateConfig(config, onChange, 'token', value)}
          placeholder="{{secrets.apiToken}}"
          type="password"
          hint="Store secrets outside the workflow when possible."
        />
      </div>

      <JsonEditor
        label="Custom headers"
        value={config?.headers}
        onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
        placeholder={'{\n  "X-Request-ID": "{{executionId}}"\n}'}
        hint="Optional headers merged into each outbound request."
        rows={4}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <NumberField
          label="Timeout (ms)"
          value={config?.timeout ?? 30000}
          onChange={(value) => updateConfig(config, onChange, 'timeout', value)}
          hint="Each request uses fetchWithTimeout plus retry handling."
        />
        <NumberField
          label="Retries"
          value={config?.retries ?? 2}
          onChange={(value) => updateConfig(config, onChange, 'retries', value)}
          hint="Retry count for transient failures."
        />
      </div>
    </Section>
  );
}

function GithubForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getRepository';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Repository">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getRepository', label: 'Get repository' },
            { value: 'listIssues', label: 'List issues' },
            { value: 'createIssue', label: 'Create issue' },
            { value: 'createPullRequest', label: 'Create pull request' },
          ]}
          hint="Direct GitHub REST API operations only."
        />

        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Owner"
            value={config?.owner || ''}
            onChange={(value) => updateConfig(config, onChange, 'owner', value)}
            placeholder="octocat"
          />
          <TextField
            label="Repository"
            value={config?.repo || ''}
            onChange={(value) => updateConfig(config, onChange, 'repo', value)}
            placeholder="hello-world"
          />
        </div>

        {operation === 'listIssues' && (
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="Issue state"
              value={config?.state || 'open'}
              onChange={(value) => updateConfig(config, onChange, 'state', value)}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]}
            />
            <NumberField
              label="Per page"
              value={config?.perPage ?? 30}
              onChange={(value) => updateConfig(config, onChange, 'perPage', value)}
            />
          </div>
        )}

        {operation === 'createIssue' && (
          <JsonEditor
            label="Issue payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "title": "Bug report",\n  "body": "Created by {{nodes.previous.output}}",\n  "labels": ["triage"]\n}'}
            hint="Maps directly to POST /repos/{owner}/{repo}/issues."
            rows={8}
          />
        )}

        {operation === 'createPullRequest' && (
          <JsonEditor
            label="Pull request payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "title": "Release PR",\n  "head": "feature/my-branch",\n  "base": "main",\n  "body": "Automated PR"\n}'}
            hint="Maps directly to POST /repos/{owner}/{repo}/pulls."
            rows={8}
          />
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="GitHub API base URL"
        tokenLabel="Personal access token"
        providerId="github"
      />

      <TextField
        label="GitHub API version"
        value={config?.apiVersion || '2022-11-28'}
        onChange={(value) => updateConfig(config, onChange, 'apiVersion', value)}
        placeholder="2022-11-28"
        hint="Optional X-GitHub-Api-Version override."
      />
    </div>
  );
}

function GitlabForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getProject';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Project">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getProject', label: 'Get project' },
            { value: 'listMergeRequests', label: 'List merge requests' },
            { value: 'createIssue', label: 'Create issue' },
            { value: 'createMergeRequest', label: 'Create merge request' },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Project ID"
            value={config?.projectId || ''}
            onChange={(value) => updateConfig(config, onChange, 'projectId', value)}
            placeholder="12345"
            hint="Use project path if you prefer namespace/repo."
          />
          <TextField
            label="Project path"
            value={config?.projectPath || ''}
            onChange={(value) => updateConfig(config, onChange, 'projectPath', value)}
            placeholder="group/subgroup/project"
          />
        </div>

        {operation === 'listMergeRequests' && (
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="MR state"
              value={config?.state || 'opened'}
              onChange={(value) => updateConfig(config, onChange, 'state', value)}
              options={[
                { value: 'opened', label: 'Opened' },
                { value: 'merged', label: 'Merged' },
                { value: 'closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]}
            />
            <NumberField
              label="Per page"
              value={config?.perPage ?? 20}
              onChange={(value) => updateConfig(config, onChange, 'perPage', value)}
            />
          </div>
        )}

        {(operation === 'createIssue' || operation === 'createMergeRequest') && (
          <JsonEditor
            label={operation === 'createIssue' ? 'Issue payload' : 'Merge request payload'}
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={
              operation === 'createIssue'
                ? '{\n  "title": "Investigate failure",\n  "description": "Triggered by {{executionId}}"\n}'
                : '{\n  "title": "Sync release",\n  "source_branch": "release",\n  "target_branch": "main"\n}'
            }
            hint="Matches the native GitLab REST request body."
            rows={8}
          />
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="GitLab API base URL"
        tokenLabel="Private token"
        providerId="gitlab"
      />
    </div>
  );
}

function BitbucketForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getRepository';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Repository">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getRepository', label: 'Get repository' },
            { value: 'listPullRequests', label: 'List pull requests' },
            { value: 'createIssue', label: 'Create issue' },
            { value: 'createPullRequest', label: 'Create pull request' },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Workspace"
            value={config?.workspace || ''}
            onChange={(value) => updateConfig(config, onChange, 'workspace', value)}
            placeholder="my-workspace"
          />
          <TextField
            label="Repo slug"
            value={config?.repoSlug || ''}
            onChange={(value) => updateConfig(config, onChange, 'repoSlug', value)}
            placeholder="my-repo"
          />
        </div>

        {operation === 'listPullRequests' && (
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="PR state"
              value={config?.state || 'OPEN'}
              onChange={(value) => updateConfig(config, onChange, 'state', value)}
              options={[
                { value: 'OPEN', label: 'Open' },
                { value: 'MERGED', label: 'Merged' },
                { value: 'DECLINED', label: 'Declined' },
                { value: 'SUPERSEDED', label: 'Superseded' },
              ]}
            />
            <NumberField
              label="Page length"
              value={config?.perPage ?? 20}
              onChange={(value) => updateConfig(config, onChange, 'perPage', value)}
            />
          </div>
        )}

        {(operation === 'createIssue' || operation === 'createPullRequest') && (
          <JsonEditor
            label={operation === 'createIssue' ? 'Issue payload' : 'Pull request payload'}
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={
              operation === 'createIssue'
                ? '{\n  "title": "Production alert",\n  "content": { "raw": "Captured from {{nodes.alert.output}}" }\n}'
                : '{\n  "title": "Release sync",\n  "source": { "branch": { "name": "release" } },\n  "destination": { "branch": { "name": "main" } }\n}'
            }
            hint="Provide the exact Bitbucket Cloud REST payload."
            rows={8}
          />
        )}
      </Section>

      <Section title="Authentication">
        <div className="grid gap-3 md:grid-cols-3">
          <TextField
            label="Bearer token"
            value={config?.token || ''}
            onChange={(value) => updateConfig(config, onChange, 'token', value)}
            placeholder="{{secrets.bitbucketToken}}"
            type="password"
            hint="Optional alternative to app-password auth."
          />
          <TextField
            label="Username"
            value={config?.username || ''}
            onChange={(value) => updateConfig(config, onChange, 'username', value)}
            placeholder="workspace-user"
          />
          <TextField
            label="App password"
            value={config?.appPassword || ''}
            onChange={(value) => updateConfig(config, onChange, 'appPassword', value)}
            placeholder="{{secrets.bitbucketAppPassword}}"
            type="password"
          />
        </div>
      </Section>

      <CommonRequestFields config={config} onChange={onChange} baseUrlLabel="Bitbucket API base URL" tokenLabel="Bearer token" />
    </div>
  );
}

function JiraForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getIssue';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Jira operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getIssue', label: 'Get issue' },
            { value: 'searchIssues', label: 'Search issues' },
            { value: 'createIssue', label: 'Create issue' },
            { value: 'transitionIssue', label: 'Transition issue' },
          ]}
        />

        {(operation === 'getIssue' || operation === 'transitionIssue') && (
          <TextField
            label="Issue key"
            value={config?.issueKey || ''}
            onChange={(value) => updateConfig(config, onChange, 'issueKey', value)}
            placeholder="PROJ-123"
          />
        )}

        {operation === 'searchIssues' && (
          <TextField
            label="JQL"
            value={config?.jql || ''}
            onChange={(value) => updateConfig(config, onChange, 'jql', value)}
            placeholder="project = PROJ AND statusCategory != Done ORDER BY updated DESC"
            hint="Uses the Jira issue search endpoint."
          />
        )}

        {(operation === 'createIssue' || operation === 'transitionIssue') && (
          <JsonEditor
            label={operation === 'createIssue' ? 'Issue payload' : 'Transition payload'}
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={
              operation === 'createIssue'
                ? '{\n  "fields": {\n    "project": { "key": "PROJ" },\n    "summary": "Investigate alert",\n    "issuetype": { "name": "Task" }\n  }\n}'
                : '{\n  "transition": {\n    "id": "31"\n  }\n}'
            }
            hint="Use the exact Jira REST payload for advanced fields."
            rows={9}
          />
        )}
      </Section>

      <Section title="Authentication">
        <CredentialPicker
          providerId="jira"
          config={config}
          onChange={(updates) => onChange({ ...config, ...updates })}
          label="Credentials"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <TextField
            label="Base URL"
            value={config?.baseUrl || ''}
            onChange={(value) => updateConfig(config, onChange, 'baseUrl', value)}
            placeholder="https://your-domain.atlassian.net"
          />
          <TextField
            label="Email"
            value={config?.email || ''}
            onChange={(value) => updateConfig(config, onChange, 'email', value)}
            placeholder="ops@example.com"
            hint="Use email + API token for Atlassian Cloud basic auth."
          />
          <TextField
            label="API token / bearer token"
            value={config?.apiToken || config?.token || ''}
            onChange={(value) => {
              onChange({ ...config, apiToken: value, token: value });
            }}
            placeholder="{{secrets.jiraApiToken}}"
            type="password"
          />
        </div>
      </Section>

      <Section title="Advanced">
        <JsonEditor
          label="Custom headers"
          value={config?.headers}
          onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
          placeholder={'{\n  "X-Atlassian-Token": "no-check"\n}'}
          rows={4}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField
            label="Timeout (ms)"
            value={config?.timeout ?? 30000}
            onChange={(value) => updateConfig(config, onChange, 'timeout', value)}
          />
          <NumberField
            label="Retries"
            value={config?.retries ?? 2}
            onChange={(value) => updateConfig(config, onChange, 'retries', value)}
          />
        </div>
      </Section>
    </div>
  );
}

function LinearForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'listIssues';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Linear operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'listIssues', label: 'List issues' },
            { value: 'getIssue', label: 'Get issue' },
            { value: 'createIssue', label: 'Create issue' },
            { value: 'updateIssue', label: 'Update issue' },
          ]}
          hint="Uses direct HTTP requests to the Linear API endpoint."
        />

        {(operation === 'getIssue' || operation === 'updateIssue') && (
          <TextField
            label="Issue ID"
            value={config?.issueId || ''}
            onChange={(value) => updateConfig(config, onChange, 'issueId', value)}
            placeholder="issue_uuid"
          />
        )}

        {(operation === 'listIssues' || operation === 'createIssue' || operation === 'updateIssue') && (
          <div className="grid gap-3 md:grid-cols-3">
            <TextField
              label="Team ID"
              value={config?.teamId || ''}
              onChange={(value) => updateConfig(config, onChange, 'teamId', value)}
              placeholder="team_uuid"
            />
            <TextField
              label="State ID"
              value={config?.stateId || ''}
              onChange={(value) => updateConfig(config, onChange, 'stateId', value)}
              placeholder="state_uuid"
            />
            <TextField
              label="Assignee ID"
              value={config?.assigneeId || ''}
              onChange={(value) => updateConfig(config, onChange, 'assigneeId', value)}
              placeholder="user_uuid"
            />
          </div>
        )}

        {operation === 'listIssues' && (
          <NumberField
            label="Issue limit"
            value={config?.limit ?? 25}
            onChange={(value) => updateConfig(config, onChange, 'limit', value)}
          />
        )}

        {(operation === 'createIssue' || operation === 'updateIssue') && (
          <JsonEditor
            label="Issue input"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "teamId": "{{teamId}}",\n  "title": "Follow up with customer",\n  "description": "Synced from workflow"\n}'}
            hint="Provide the issue create/update input object."
            rows={8}
          />
        )}
      </Section>

      <Section title="Authentication">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="API endpoint"
            value={config?.baseUrl || 'https://api.linear.app/graphql'}
            onChange={(value) => updateConfig(config, onChange, 'baseUrl', value)}
            placeholder="https://api.linear.app/graphql"
          />
          <TextField
            label="API key"
            value={config?.token || ''}
            onChange={(value) => updateConfig(config, onChange, 'token', value)}
            placeholder="{{secrets.linearApiKey}}"
            type="password"
          />
        </div>
        <ToggleField
          label="Use Bearer prefix"
          checked={Boolean(config?.useBearerToken)}
          onChange={(value) => updateConfig(config, onChange, 'useBearerToken', value)}
          hint="Linear personal API keys can be sent directly; OAuth tokens typically use Bearer."
        />
      </Section>

      <Section title="Advanced">
        <JsonEditor
          label="Custom headers"
          value={config?.headers}
          onValidChange={(value) => updateConfig(config, onChange, 'headers', value)}
          placeholder={'{\n  "X-Trace": "{{executionId}}"\n}'}
          rows={4}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField
            label="Timeout (ms)"
            value={config?.timeout ?? 30000}
            onChange={(value) => updateConfig(config, onChange, 'timeout', value)}
          />
          <NumberField
            label="Retries"
            value={config?.retries ?? 2}
            onChange={(value) => updateConfig(config, onChange, 'retries', value)}
          />
        </div>
      </Section>
    </div>
  );
}

function AsanaForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getTask';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Task operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getTask', label: 'Get task' },
            { value: 'listTasks', label: 'List tasks' },
            { value: 'createTask', label: 'Create task' },
            { value: 'updateTask', label: 'Update task' },
          ]}
        />

        {(operation === 'getTask' || operation === 'updateTask') && (
          <TextField
            label="Task ID"
            value={config?.taskId || ''}
            onChange={(value) => updateConfig(config, onChange, 'taskId', value)}
            placeholder="120123456789"
          />
        )}

        {operation === 'listTasks' && (
          <TextField
            label="Project ID"
            value={config?.projectId || ''}
            onChange={(value) => updateConfig(config, onChange, 'projectId', value)}
            placeholder="120123456789"
          />
        )}

        {(operation === 'createTask' || operation === 'updateTask') && (
          <JsonEditor
            label="Task payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "data": {\n    "name": "Follow up",\n    "notes": "Created from {{nodes.crm.output}}"\n  }\n}'}
            hint="Wrap task fields inside the Asana data object."
            rows={8}
          />
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="Asana API base URL"
        tokenLabel="Personal access token"
      />
    </div>
  );
}

function NotionForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getPage';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Notion operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getPage', label: 'Get page' },
            { value: 'queryDatabase', label: 'Query database' },
            { value: 'createPage', label: 'Create page' },
            { value: 'updatePage', label: 'Update page' },
          ]}
        />

        {(operation === 'getPage' || operation === 'updatePage') && (
          <TextField
            label="Page ID"
            value={config?.pageId || ''}
            onChange={(value) => updateConfig(config, onChange, 'pageId', value)}
            placeholder="page_uuid"
          />
        )}

        {(operation === 'queryDatabase' || operation === 'createPage') && (
          <TextField
            label="Database ID"
            value={config?.databaseId || ''}
            onChange={(value) => updateConfig(config, onChange, 'databaseId', value)}
            placeholder="database_uuid"
          />
        )}

        {operation === 'queryDatabase' && (
          <JsonEditor
            label="Query payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "filter": {\n    "property": "Status",\n    "status": { "equals": "Ready" }\n  },\n  "page_size": 25\n}'}
            hint="Optional filter/sort/start_cursor payload."
            rows={8}
          />
        )}

        {(operation === 'createPage' || operation === 'updatePage') && (
          <JsonEditor
            label={operation === 'createPage' ? 'Create page payload' : 'Update page payload'}
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={
              operation === 'createPage'
                ? '{\n  "parent": { "database_id": "{{databaseId}}" },\n  "properties": {\n    "Name": { "title": [{ "text": { "content": "Workflow page" } }] }\n  }\n}'
                : '{\n  "properties": {\n    "Status": { "status": { "name": "Done" } }\n  }\n}'
            }
            hint="Provide the full Notion REST payload for complex properties."
            rows={10}
          />
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="Notion API base URL"
        tokenLabel="Integration token"
        providerId="notion"
      />

      <TextField
        label="Notion-Version"
        value={config?.notionVersion || '2022-06-28'}
        onChange={(value) => updateConfig(config, onChange, 'notionVersion', value)}
        placeholder="2022-06-28"
        hint="Sent on every request."
      />
    </div>
  );
}

function AirtableForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'listRecords';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Airtable operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'listRecords', label: 'List records' },
            { value: 'getRecord', label: 'Get record' },
            { value: 'createRecord', label: 'Create record' },
            { value: 'updateRecord', label: 'Update record' },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Base ID"
            value={config?.baseId || ''}
            onChange={(value) => updateConfig(config, onChange, 'baseId', value)}
            placeholder="appXXXXXXXXXXXXXX"
          />
          <TextField
            label="Table name"
            value={config?.tableName || ''}
            onChange={(value) => updateConfig(config, onChange, 'tableName', value)}
            placeholder="Contacts"
          />
        </div>

        {(operation === 'getRecord' || operation === 'updateRecord') && (
          <TextField
            label="Record ID"
            value={config?.recordId || ''}
            onChange={(value) => updateConfig(config, onChange, 'recordId', value)}
            placeholder="recXXXXXXXXXXXXXX"
          />
        )}

        {(operation === 'createRecord' || operation === 'updateRecord') && (
          <JsonEditor
            label="Record payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "fields": {\n    "Name": "Ada Lovelace",\n    "Status": "Active"\n  },\n  "typecast": true\n}'}
            hint="Maps directly to the Airtable record create/update body."
            rows={8}
          />
        )}

        {operation === 'listRecords' && (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="View"
              value={config?.view || ''}
              onChange={(value) => updateConfig(config, onChange, 'view', value)}
              placeholder="Grid view"
            />
            <TextField
              label="Filter formula"
              value={config?.filterByFormula || ''}
              onChange={(value) => updateConfig(config, onChange, 'filterByFormula', value)}
              placeholder="{Status}='Active'"
            />
          </div>
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="Airtable API base URL"
        tokenLabel="Personal access token"
      />
    </div>
  );
}

function GoogleSheetsForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getValues';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Spreadsheet operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getValues', label: 'Get values' },
            { value: 'appendValues', label: 'Append values' },
            { value: 'updateValues', label: 'Update values' },
            { value: 'batchUpdate', label: 'Batch update' },
          ]}
        />

        <TextField
          label="Spreadsheet ID"
          value={config?.spreadsheetId || ''}
          onChange={(value) => updateConfig(config, onChange, 'spreadsheetId', value)}
          placeholder="1AbCdEf..."
        />

        {operation !== 'batchUpdate' && (
          <TextField
            label="A1 range"
            value={config?.range || ''}
            onChange={(value) => updateConfig(config, onChange, 'range', value)}
            placeholder="Sheet1!A1:C10"
            hint="Supports interpolation in sheet names and ranges."
          />
        )}

        {(operation === 'appendValues' || operation === 'updateValues') && (
          <JsonEditor
            label="Values payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "values": [\n    ["Name", "Status"],\n    ["Ada", "Active"]\n  ],\n  "majorDimension": "ROWS"\n}'}
            hint="Use a 2D values array for row/column updates."
            rows={8}
          />
        )}

        {operation === 'batchUpdate' && (
          <JsonEditor
            label="Batch update payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={'{\n  "requests": [\n    {\n      "repeatCell": {\n        "range": { "sheetId": 0 },\n        "cell": { "userEnteredFormat": { "textFormat": { "bold": true } } },\n        "fields": "userEnteredFormat.textFormat.bold"\n      }\n    }\n  ]\n}'}
            hint="Matches spreadsheets.batchUpdate."
            rows={10}
          />
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="Sheets API base URL"
        tokenLabel="OAuth access token"
      />

      {(operation === 'appendValues' || operation === 'updateValues') && (
        <SelectField
          label="Value input option"
          value={config?.valueInputOption || 'USER_ENTERED'}
          onChange={(value) => updateConfig(config, onChange, 'valueInputOption', value)}
          options={[
            { value: 'USER_ENTERED', label: 'USER_ENTERED' },
            { value: 'RAW', label: 'RAW' },
          ]}
        />
      )}
    </div>
  );
}

function ExcelForm({ config, onChange }: NodeFormProps) {
  const operation = config?.operation || 'getRange';

  return (
    <div className="space-y-4">
      <InterpolationHint />
      <Section title="Workbook operation">
        <SelectField
          label="Operation"
          value={operation}
          onChange={(value) => updateConfig(config, onChange, 'operation', value)}
          options={[
            { value: 'getRange', label: 'Get range' },
            { value: 'updateRange', label: 'Update range' },
            { value: 'addTableRow', label: 'Add table row' },
            { value: 'createWorksheet', label: 'Create worksheet' },
          ]}
        />

        <TextField
          label="Drive item ID"
          value={config?.driveItemId || ''}
          onChange={(value) => updateConfig(config, onChange, 'driveItemId', value)}
          placeholder="01ABCDEF..."
          hint="Microsoft Graph file item ID for the workbook."
        />

        {(operation === 'getRange' || operation === 'updateRange') && (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Worksheet ID"
              value={config?.worksheetId || ''}
              onChange={(value) => updateConfig(config, onChange, 'worksheetId', value)}
              placeholder="Sheet1"
            />
            <TextField
              label="Range"
              value={config?.range || ''}
              onChange={(value) => updateConfig(config, onChange, 'range', value)}
              placeholder="A1:C10"
            />
          </div>
        )}

        {operation === 'addTableRow' && (
          <TextField
            label="Table ID"
            value={config?.tableId || ''}
            onChange={(value) => updateConfig(config, onChange, 'tableId', value)}
            placeholder="{table-id}"
          />
        )}

        {operation === 'createWorksheet' && (
          <TextField
            label="Worksheet name"
            value={config?.worksheetName || ''}
            onChange={(value) => updateConfig(config, onChange, 'worksheetName', value)}
            placeholder="Automated Report"
          />
        )}

        {(operation === 'updateRange' || operation === 'addTableRow') && (
          <JsonEditor
            label="Workbook payload"
            value={config?.payload}
            onValidChange={(value) => updateConfig(config, onChange, 'payload', value)}
            placeholder={
              operation === 'updateRange'
                ? '{\n  "values": [\n    ["Name", "Status"],\n    ["Ada", "Active"]\n  ]\n}'
                : '{\n  "values": [\n    ["Ada", "Active", "{{now}}"]\n  ]\n}'
            }
            hint="Provide values arrays using Microsoft Graph workbook format."
            rows={8}
          />
        )}
      </Section>

      <CommonRequestFields
        config={config}
        onChange={onChange}
        baseUrlLabel="Microsoft Graph base URL"
        tokenLabel="OAuth access token"
      />
    </div>
  );
}

export const integrationDevtoolsForms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.INTEGRATION_GITHUB]: GithubForm,
  [NodeType.INTEGRATION_GITLAB]: GitlabForm,
  [NodeType.INTEGRATION_BITBUCKET]: BitbucketForm,
  [NodeType.INTEGRATION_JIRA]: JiraForm,
  [NodeType.INTEGRATION_LINEAR]: LinearForm,
  [NodeType.INTEGRATION_ASANA]: AsanaForm,
  [NodeType.INTEGRATION_NOTION]: NotionForm,
  [NodeType.INTEGRATION_AIRTABLE]: AirtableForm,
  [NodeType.INTEGRATION_GOOGLE_SHEETS]: GoogleSheetsForm,
  [NodeType.INTEGRATION_EXCEL]: ExcelForm,
};
