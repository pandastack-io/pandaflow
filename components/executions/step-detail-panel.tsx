'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatDuration, type ExecutionReplayStep } from '@/lib/executions/replay';

interface StepDetailPanelProps {
  step: ExecutionReplayStep | null;
}

function stringifyValue(value: unknown) {
  if (value === undefined) return 'No data captured.';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CodeBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs text-foreground">
      {stringifyValue(value)}
    </pre>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const className = {
    debug: 'border-border bg-muted text-muted-foreground',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    warn: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  }[level] || 'border-border bg-muted text-muted-foreground';

  return <Badge variant="outline" className={cn('capitalize', className)}>{level}</Badge>;
}

export function StepDetailPanel({ step }: StepDetailPanelProps) {
  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm text-foreground">{step ? step.nodeName : 'Step Details'}</CardTitle>
            {step ? (
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="font-mono text-muted-foreground">{step.nodeId}</span>
                <span>{formatDuration(step.durationMs)}</span>
                <span>{step.logCount} logs</span>
              </div>
            ) : null}
          </div>
          {step?.error ? (
            <div className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Error captured
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {!step ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Select a step to inspect inputs, outputs, and logs.
          </div>
        ) : (
          <Tabs defaultValue="input" className="space-y-4">
            <TabsList className="w-full justify-start bg-muted text-muted-foreground">
              <TabsTrigger value="input" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Input</TabsTrigger>
              <TabsTrigger value="output" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Output</TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Logs</TabsTrigger>
              <TabsTrigger value="raw" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Raw</TabsTrigger>
            </TabsList>

            <TabsContent value="input">
              <CodeBlock value={step.input} />
            </TabsContent>

            <TabsContent value="output">
              <CodeBlock value={step.output} />
            </TabsContent>

            <TabsContent value="logs" className="space-y-3">
              {step.logs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  No logs recorded for this step.
                </div>
              ) : (
                step.logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <LogLevelBadge level={log.level} />
                        <span className="text-sm text-foreground">{log.message}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'No timestamp'}
                      </div>
                    </div>
                    {log.data !== undefined && log.data !== null ? (
                      <div className="mt-3">
                        <CodeBlock value={log.data} />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="raw">
              <CodeBlock value={step.raw} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
