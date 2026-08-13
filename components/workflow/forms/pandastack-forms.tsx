/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { ComponentType, ReactNode } from 'react';
import { NodeType } from '@/types/nodes';
import { NodeFormProps } from './index';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MonacoCodeEditor, type MonacoCodeEditorProps } from '@/components/workflow/monaco-code-editor';
import { PackageManager, type PackageManagerRuntime } from '@/components/workflow/package-manager';
import { CredentialPicker } from './credential-picker';

type FieldProps = {
  label: string;
  helper?: string;
  required?: boolean;
  children: ReactNode;
};

function Field({ label, helper, required, children }: FieldProps) {
  return (
    <div>
      <Label>{label}{required && <span className="text-destructive ml-1">*</span>}</Label>
      <div className="mt-1">{children}</div>
      {helper ? <p className="text-xs text-muted-foreground mt-1">{helper}</p> : null}
    </div>
  );
}

function useUpdater(config: any, onChange: (config: any) => void) {
  return (key: string, value: any) => onChange({ ...config, [key]: value });
}

type MonacoLanguage = MonacoCodeEditorProps['language'];

const runtimeLanguageMap: Record<string, MonacoLanguage> = {
  python: 'python',
  nodejs: 'javascript',
  go: 'go',
  rust: 'rust',
  bash: 'shell',
  ruby: 'ruby',
  php: 'php',
  java: 'java',
};

const packageRuntimeMap: Partial<Record<string, PackageManagerRuntime>> = {
  python: 'python',
  nodejs: 'nodejs',
  go: 'go',
};

function getMonacoLanguage(runtime?: string): MonacoLanguage {
  return runtimeLanguageMap[runtime || ''] || 'python';
}

function getPackageRuntime(runtime?: string): PackageManagerRuntime | undefined {
  return runtime ? packageRuntimeMap[runtime] : undefined;
}

function normalizePackages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function TextField({ label, value, onChange, placeholder, type = 'text', helper }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string; type?: string; helper?: string; }) {
  return (
    <Field label={label} helper={helper}>
      <Input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function NumberField({ label, value, onChange, min, max, step, helper }: { label: string; value: any; onChange: (value: number | undefined) => void; min?: number; max?: number; step?: number; helper?: string; }) {
  return (
    <Field label={label} helper={helper}>
      <Input type="number" value={value ?? ''} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </Field>
  );
}

function TextAreaField({ label, value, onChange, helper, rows = 5, placeholder }: { label: string; value: any; onChange: (value: string) => void; helper?: string; rows?: number; placeholder?: string; }) {
  return (
    <Field label={label} helper={helper}>
      <Textarea rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function JsonField({ label, value, onChange, helper, rows = 4 }: { label: string; value: any; onChange: (value: any) => void; helper?: string; rows?: number; }) {
  const displayValue = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
  return (
    <Field label={label} helper={helper}>
      <Textarea
        rows={rows}
        value={displayValue}
        onChange={(e) => {
          const raw = e.target.value;
          try {
            onChange(raw.trim() ? JSON.parse(raw) : {});
          } catch {
            onChange(raw);
          }
        }}
      />
    </Field>
  );
}

function ToggleField({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (checked: boolean) => void; helper?: string; }) {
  return (
    <Field label={label} helper={helper}>
      <div className="flex h-10 items-center">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </Field>
  );
}

function PandaStackCredentialFields({ config, onChange }: NodeFormProps) {
  return (
    <CredentialPicker
      providerId="pandastack"
      config={config}
      onChange={(updates) => onChange({ ...config, ...updates })}
      label="Credentials"
    />
  );
}

function RuntimeFields({
  config,
  update,
  codeLanguage,
  packageRuntime,
}: {
  config: any;
  update: (key: string, value: any) => void;
  codeLanguage: MonacoLanguage;
  packageRuntime?: PackageManagerRuntime;
}) {
  return (
    <>
      <PandaStackCredentialFields config={config} onChange={(nextConfig) => update('apiKey', nextConfig.apiKey)} />
      <Field label="Provider" helper="Auto uses PandaStack when configured and falls back to the mock provider when allowed.">
        <Select value={config.provider || 'auto'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="pandastack">PandaStack</SelectItem>
            <SelectItem value="mock">Mock</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="PandaStack API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} helper="Optional override. The executor falls back to PANDASTACK_API_KEY when omitted." />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} placeholder="upstreamVariableName" />
      <Field label="Code / Script" helper="This source code is interpolated at runtime, so you can reference workflow variables like {{variableName}}.">
        <MonacoCodeEditor value={config.code || ''} onChange={(value) => update('code', value)} language={codeLanguage} />
      </Field>
      {packageRuntime ? (
        <PackageManager
          packages={normalizePackages(config.packages)}
          onChange={(packages) => update('packages', packages)}
          runtime={packageRuntime}
        />
      ) : null}
      <TextAreaField label="STDIN" value={config.stdin || ''} onChange={(value) => update('stdin', value)} rows={3} helper="Optional standard input passed to the runtime." />
      <JsonField label="Environment Variables" value={config.environment || {}} onChange={(value) => update('environment', value)} helper="Provide a JSON object of environment variables." />
      <TextField label="Template" value={config.template || ''} onChange={(value) => update('template', value)} placeholder="code-interpreter" helper="Optional PandaStack template or preset." />
      <Field label="Sandbox Size">
        <Select value={config.size || 'nano'} onValueChange={(value) => update('size', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nano">Nano</SelectItem>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
            <SelectItem value="xlarge">XLarge</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
      <NumberField label="Memory Limit (MB)" value={config.memoryLimit} onChange={(value) => update('memoryLimit', value)} min={64} max={32768} step={64} />
      <ToggleField label="Fail On Non-Zero Exit" checked={config.failOnNonZeroExit ?? true} onChange={(value) => update('failOnNonZeroExit', value)} />
      <ToggleField label="Expose Input As Env" checked={config.exposeInputAsEnv ?? true} onChange={(value) => update('exposeInputAsEnv', value)} helper="Adds WORKFLOW_INPUT and WORKFLOW_INPUT_JSON to the sandbox environment." />
      <ToggleField label="Fallback To Mock" checked={config.fallbackToMock ?? true} onChange={(value) => update('fallbackToMock', value)} helper="Useful for local development or when the PandaStack API is unavailable." />
      <ToggleField label="Parse JSON Output" checked={config.parseJsonOutput ?? true} onChange={(value) => update('parseJsonOutput', value)} helper="If enabled, stdout will be JSON-parsed when possible." />
    </>
  );
}

function GenericRuntimeForm({
  config,
  onChange,
  runtimeName,
  runtimeKey,
}: NodeFormProps & { runtimeName: string; runtimeKey: string }) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <Field label="Runtime">
        <Input value={runtimeName} readOnly />
      </Field>
      <RuntimeFields
        config={config}
        update={update}
        codeLanguage={getMonacoLanguage(runtimeKey)}
        packageRuntime={getPackageRuntime(runtimeKey)}
      />
    </div>
  );
}

function ExecuteForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  const runtime = config.language || 'python';

  return (
    <div className="space-y-3">
      <Field label="Runtime Language">
        <Select value={runtime} onValueChange={(value) => update('language', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="nodejs">Node.js</SelectItem>
            <SelectItem value="go">Go</SelectItem>
            <SelectItem value="rust">Rust</SelectItem>
            <SelectItem value="bash">Bash</SelectItem>
            <SelectItem value="ruby">Ruby</SelectItem>
            <SelectItem value="php">PHP</SelectItem>
            <SelectItem value="java">Java</SelectItem>
            <SelectItem value="docker">Docker</SelectItem>
            <SelectItem value="jupyter">Jupyter</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <RuntimeFields
        config={config}
        update={update}
        codeLanguage={getMonacoLanguage(runtime)}
        packageRuntime={getPackageRuntime(runtime)}
      />
    </div>
  );
}

function ScrapeForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <Field label="Provider">
        <Select value={config.provider || 'auto'} onValueChange={(value) => update('provider', value)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="pandastack">PandaStack</SelectItem>
            <SelectItem value="mock">Mock</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <TextField label="PandaStack API Key" type="password" value={config.apiKey || ''} onChange={(value) => update('apiKey', value)} helper="Optional override. Falls back to PANDASTACK_API_KEY." />
      <TextField label="Input Variable" value={config.inputVariable || ''} onChange={(value) => update('inputVariable', value)} placeholder="input" />
      <TextField label="URL" value={config.url || ''} onChange={(value) => update('url', value)} placeholder="https://example.com" />
      <TextField label="Wait For Selector" value={config.waitFor || ''} onChange={(value) => update('waitFor', value)} placeholder="#app, article" />
      <NumberField label="Timeout (ms)" value={config.timeout || 30000} onChange={(value) => update('timeout', value)} min={1000} max={300000} step={1000} />
      <ToggleField label="Execute JavaScript" checked={config.javascript ?? true} onChange={(value) => update('javascript', value)} helper="Enable for client-rendered pages." />
      <ToggleField label="Fallback To Mock" checked={config.fallbackToMock ?? true} onChange={(value) => update('fallbackToMock', value)} helper="Useful for local development when PandaStack is not available." />
    </div>
  );
}

function PythonForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Python" runtimeKey="python" />;
}

function NodeJsForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Node.js" runtimeKey="nodejs" />;
}

function GoForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Go" runtimeKey="go" />;
}

function RustForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Rust" runtimeKey="rust" />;
}

function BashForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Bash" runtimeKey="bash" />;
}

function RubyForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Ruby" runtimeKey="ruby" />;
}

function PhpForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="PHP" runtimeKey="php" />;
}

function JavaForm(props: NodeFormProps) {
  return <GenericRuntimeForm {...props} runtimeName="Java" runtimeKey="java" />;
}

function DockerForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <Field label="Runtime">
        <Input value="Docker" readOnly />
      </Field>
      <RuntimeFields config={config} update={update} codeLanguage="shell" />
      <TextAreaField label="Dockerfile" value={config.dockerfile || ''} onChange={(value) => update('dockerfile', value)} rows={8} helper="Optional Dockerfile content when you want to describe a custom container build." />
      <TextField label="Command" value={config.command || ''} onChange={(value) => update('command', value)} placeholder="docker build . && docker run ..." helper="Optional container command or orchestration script." />
      <JsonField label="Registry Auth" value={config.registryAuth || {}} onChange={(value) => update('registryAuth', value)} helper="Optional registry auth headers/config represented as JSON." />
    </div>
  );
}

function JupyterForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <Field label="Runtime">
        <Input value="Jupyter / Notebook" readOnly />
      </Field>
      <RuntimeFields config={config} update={update} codeLanguage="python" packageRuntime="python" />
      <TextAreaField label="Notebook Cells" value={typeof config.cells === 'string' ? config.cells : JSON.stringify(config.cells || [], null, 2)} onChange={(value) => { try { update('cells', value.trim() ? JSON.parse(value) : []); } catch { update('cells', value); } }} rows={10} helper="Provide an array of cell objects or strings. Cells run sequentially in a shared Python sandbox." />
      <TextAreaField label="Notebook JSON" value={config.notebook || ''} onChange={(value) => update('notebook', value)} rows={8} helper="Optional full notebook JSON. Used when cells are not provided." />
      <ToggleField label="Continue On Error" checked={config.continueOnError ?? false} onChange={(value) => update('continueOnError', value)} helper="If enabled, remaining cells continue after a failure and all outputs are collected." />
    </div>
  );
}

function FileWriteForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Writes a file into the <strong>shared sandbox</strong>. Place this node after a PandaStack code node so the sandbox exists.
      </div>
      <Field label="File Path" required>
        <Input
          value={config.path || '/home/user/file.txt'}
          onChange={(e) => update('path', e.target.value)}
          placeholder="/home/user/output.csv"
        />
      </Field>
      <TextAreaField
        label="Content"
        value={config.content || ''}
        onChange={(v) => update('content', v)}
        rows={8}
        helper="Content to write. Supports template variables like {{input.data}}."
      />
    </div>
  );
}

function FileReadForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Reads a file from the <strong>shared sandbox</strong> filesystem.
      </div>
      <Field label="File Path" required>
        <Input
          value={config.path || '/home/user/file.txt'}
          onChange={(e) => update('path', e.target.value)}
          placeholder="/home/user/output.csv"
        />
      </Field>
      <Field label="Encoding">
        <Select value={config.encoding || 'utf8'} onValueChange={(v) => update('encoding', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="utf8">UTF-8 (text)</SelectItem>
            <SelectItem value="base64">Base64 (binary)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function FileListForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Lists files and directories inside the <strong>shared sandbox</strong>.
      </div>
      <Field label="Directory Path">
        <Input
          value={config.path || '/home/user'}
          onChange={(e) => update('path', e.target.value)}
          placeholder="/home/user"
        />
      </Field>
    </div>
  );
}

function InstallForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Installs packages into the <strong>shared sandbox</strong>. Installed packages are available to all subsequent nodes in this workflow.
      </div>
      <Field label="Package Manager">
        <Select value={config.runtime || 'pip'} onValueChange={(v) => update('runtime', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pip">pip (Python)</SelectItem>
            <SelectItem value="npm">npm (Node.js)</SelectItem>
            <SelectItem value="apt">apt (system)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Packages" required>
        <Input
          value={config.packages || ''}
          onChange={(e) => update('packages', e.target.value)}
          placeholder="pandas, numpy, requests"
        />
        <p className="text-xs text-muted-foreground mt-1">Comma-separated list of packages to install.</p>
      </Field>
      <ToggleField
        label="Fail on Error"
        checked={config.failOnError ?? true}
        onChange={(v) => update('failOnError', v)}
        helper="Stop the workflow if any package fails to install."
      />
    </div>
  );
}

function SnapshotForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Saves the current shared sandbox state as a snapshot. Use the snapshot ID to boot future sandboxes with a pre-built environment.
      </div>
      <Field label="Snapshot Name">
        <Input
          value={config.name || ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="my-prebuilt-env"
        />
      </Field>
      <Field label="Description">
        <Input
          value={config.description || ''}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Environment with pandas and sklearn installed"
        />
      </Field>
    </div>
  );
}

function ForkForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Forks the shared sandbox into N independent copies. Each fork gets a full copy of the current filesystem and state — ideal for parallel exploration (tree-of-thought, A/B testing).
      </div>
      <Field label="Number of Forks">
        <Input
          type="number"
          min={2}
          max={8}
          value={config.count || 2}
          onChange={(e) => update('count', parseInt(e.target.value, 10))}
        />
        <p className="text-xs text-muted-foreground mt-1">Maximum 8 forks per call (PandaStack API limit).</p>
      </Field>
    </div>
  );
}

function GitCloneForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Clones a git repository into the shared sandbox. Subsequent code nodes can then run tests, builds, or analysis on the cloned code.
      </div>
      <Field label="Repository URL" required>
        <Input
          value={config.repoUrl || ''}
          onChange={(e) => update('repoUrl', e.target.value)}
          placeholder="https://github.com/org/repo"
        />
      </Field>
      <Field label="Branch">
        <Input
          value={config.branch || 'main'}
          onChange={(e) => update('branch', e.target.value)}
          placeholder="main"
        />
      </Field>
      <Field label="Clone Path">
        <Input
          value={config.path || '/repo'}
          onChange={(e) => update('path', e.target.value)}
          placeholder="/repo"
        />
      </Field>
      <Field label="Clone Depth">
        <Input
          type="number"
          min={1}
          value={config.depth || 1}
          onChange={(e) => update('depth', parseInt(e.target.value, 10))}
        />
        <p className="text-xs text-muted-foreground mt-1">Use 1 for shallow clone (faster). Use 0 for full history.</p>
      </Field>
      <Field label="Access Token (optional)">
        <Input
          type="password"
          value={config.token || ''}
          onChange={(e) => update('token', e.target.value)}
          placeholder="ghp_... (for private repos)"
        />
        <p className="text-xs text-muted-foreground mt-1">Token is redacted from output logs.</p>
      </Field>
    </div>
  );
}

function PlaywrightForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Runs headless Chromium (Playwright) inside the shared sandbox. Playwright is auto-installed if not present.
      </div>
      <Field label="Action">
        <Select value={config.action || 'screenshot'} onValueChange={(v) => update('action', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="screenshot">Screenshot</SelectItem>
            <SelectItem value="scrape">Scrape content</SelectItem>
            <SelectItem value="custom">Custom script</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {(config.action === 'screenshot' || config.action === 'scrape' || !config.action) && (
        <Field label="URL" required>
          <Input
            value={config.url || ''}
            onChange={(e) => update('url', e.target.value)}
            placeholder="https://example.com"
          />
        </Field>
      )}
      {config.action === 'custom' && (
        <Field label="Python Script" helper="Write a Python Playwright script. Use sync_playwright context manager.">
          <MonacoCodeEditor value={config.script || ''} onChange={(value) => update('script', value)} language="python" />
        </Field>
      )}
    </div>
  );
}

function MemoryAddForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Stores a memory using PandaStack&apos;s cross-session memory API. Memories persist across workflow runs and can be retrieved by semantic search.
      </div>
      <TextAreaField
        label="Content"
        value={config.content || ''}
        onChange={(v) => update('content', v)}
        rows={5}
        helper="The memory content to store. Supports {{input}} variables."
      />
      <Field label="Category">
        <Input
          value={config.category || 'general'}
          onChange={(e) => update('category', e.target.value)}
          placeholder="general"
        />
      </Field>
    </div>
  );
}

function MemorySearchForm({ config, onChange }: NodeFormProps) {
  const update = useUpdater(config, onChange);
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={config} onChange={onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Searches PandaStack memories by semantic similarity. Returns ranked results with relevance scores.
      </div>
      <Field label="Query" required>
        <Input
          value={config.query || ''}
          onChange={(e) => update('query', e.target.value)}
          placeholder="What did the user ask about last week?"
        />
      </Field>
      <Field label="Max Results">
        <Input
          type="number"
          min={1}
          max={50}
          value={config.limit || 10}
          onChange={(e) => update('limit', parseInt(e.target.value, 10))}
        />
      </Field>
      <Field label="Category Filter (optional)">
        <Input
          value={config.category || ''}
          onChange={(e) => update('category', e.target.value)}
          placeholder="Leave empty to search all categories"
        />
      </Field>
    </div>
  );
}

function MetricsForm(props: NodeFormProps) {
  return (
    <div className="space-y-3">
      <PandaStackCredentialFields config={props.config} onChange={props.onChange} />
      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
        Fetches CPU, memory usage, and running process list from the shared sandbox. Useful for monitoring long-running tasks or debugging resource usage.
      </div>
      <p className="text-sm text-muted-foreground">No configuration needed — this node reads metrics from the shared sandbox automatically.</p>
    </div>
  );
}

export const pandastackforms: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  [NodeType.PANDASTACK_EXECUTE]: ExecuteForm,
  [NodeType.PANDASTACK_SCRAPE]: ScrapeForm,
  [NodeType.PANDASTACK_PYTHON]: PythonForm,
  [NodeType.PANDASTACK_NODEJS]: NodeJsForm,
  [NodeType.PANDASTACK_GO]: GoForm,
  [NodeType.PANDASTACK_RUST]: RustForm,
  [NodeType.PANDASTACK_BASH]: BashForm,
  [NodeType.PANDASTACK_RUBY]: RubyForm,
  [NodeType.PANDASTACK_PHP]: PhpForm,
  [NodeType.PANDASTACK_JAVA]: JavaForm,
  [NodeType.PANDASTACK_DOCKER]: DockerForm,
  [NodeType.PANDASTACK_JUPYTER]: JupyterForm,
  [NodeType.PANDASTACK_FILE_WRITE]: FileWriteForm,
  [NodeType.PANDASTACK_FILE_READ]: FileReadForm,
  [NodeType.PANDASTACK_FILE_LIST]: FileListForm,
  [NodeType.PANDASTACK_INSTALL]: InstallForm,
  [NodeType.PANDASTACK_SNAPSHOT]: SnapshotForm,
  [NodeType.PANDASTACK_FORK]: ForkForm,
  [NodeType.PANDASTACK_GIT_CLONE]: GitCloneForm,
  [NodeType.PANDASTACK_PLAYWRIGHT]: PlaywrightForm,
  [NodeType.PANDASTACK_MEMORY_ADD]: MemoryAddForm,
  [NodeType.PANDASTACK_MEMORY_SEARCH]: MemorySearchForm,
  [NodeType.PANDASTACK_METRICS]: MetricsForm,
};
