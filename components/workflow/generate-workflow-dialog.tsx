'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { Edge, Node } from 'reactflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { WorkflowNodeData } from '@/types/nodes';

type GeneratedWorkflowDefinition = {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
};

type GeneratedWorkflowPreviewNode = {
  id: string;
  label: string;
  nodeType: string;
};

type GeneratedWorkflowResult = {
  workflowId?: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  nodes: GeneratedWorkflowPreviewNode[];
  definition: GeneratedWorkflowDefinition;
};

interface GenerateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId?: string;
  onApply?: (definition: GeneratedWorkflowDefinition, prompt: string) => Promise<void> | void;
  onGenerated?: (result: GeneratedWorkflowResult) => Promise<void> | void;
  applyLabel?: string;
}

const EXAMPLE_PROMPTS = [
  'Monitor competitor prices daily',
  'Summarize emails and send Slack digest',
  'Scrape news, summarize with GPT, post to Notion',
  'Run Python data analysis on CSV files',
  'Send weekly reports via email',
];

function LoadingSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GenerateWorkflowDialog({
  open,
  onOpenChange,
  workflowId,
  onApply,
  onGenerated,
  applyLabel = 'Apply to Canvas',
}: GenerateWorkflowDialogProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflowResult | null>(null);

  const isCanvasMode = Boolean(workflowId);

  const summary = useMemo(() => {
    if (!generatedWorkflow) {
      return null;
    }

    return `${generatedWorkflow.nodeCount} nodes • ${generatedWorkflow.edgeCount} connections`;
  }, [generatedWorkflow]);

  const resetDialog = () => {
    setPrompt('');
    setGenerating(false);
    setApplying(false);
    setError(null);
    setGeneratedWorkflow(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe the workflow you want to generate.');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedWorkflow(null);

    try {
      const response = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: prompt.trim(), workflowId }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate workflow');
      }

      const result = data.data as GeneratedWorkflowResult;
      setGeneratedWorkflow(result);
      await onGenerated?.(result);
    } catch (generationError) {
      setGeneratedWorkflow(null);
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate workflow');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async () => {
    if (!generatedWorkflow || !onApply) {
      return;
    }

    setApplying(true);
    setError(null);

    try {
      await onApply(generatedWorkflow.definition, prompt.trim());
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Failed to apply generated workflow');
    } finally {
      setApplying(false);
    }
  };

  const handleOpenCanvas = () => {
    if (!generatedWorkflow?.workflowId) {
      return;
    }

    onOpenChange(false);
    resetDialog();
    router.push(`/workflows/${generatedWorkflow.workflowId}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetDialog();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur sm:max-w-4xl">
        <div className="border-b border-border/60 bg-gradient-to-br from-amber-500/10 via-background to-background px-6 py-6">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <div className="rounded-xl bg-amber-500/15 p-2 text-amber-500">
                <Sparkles className="h-5 w-5" />
              </div>
              Generate with AI
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-6">
              Describe the workflow you want and AI will build a complete node graph with configuration, ready to edit.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Describe what you want your workflow to do...</label>
            <Textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setError(null);
              }}
              placeholder="Describe what you want your workflow to do..."
              className="min-h-40 resize-none rounded-2xl border-border/60 bg-muted/20 text-base"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((examplePrompt) => (
                <button
                  key={examplePrompt}
                  type="button"
                  onClick={() => {
                    setPrompt(examplePrompt);
                    setError(null);
                  }}
                  className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-foreground"
                >
                  {examplePrompt}
                </button>
              ))}
            </div>
          </div>

          {generating ? <LoadingSkeleton /> : null}

          {generatedWorkflow ? (
            <div className="space-y-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-lg font-semibold text-foreground">{generatedWorkflow.name}</h3>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{generatedWorkflow.description}</p>
                </div>
                {summary ? (
                  <Badge variant="secondary" className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-700">
                    {summary}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Workflow preview</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {generatedWorkflow.nodes.map((node, index) => (
                    <div key={node.id} className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{index + 1}. {node.label}</p>
                          <p className="text-xs text-muted-foreground">{node.nodeType}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
                          Node
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={generating || applying}>
            Cancel
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void handleGenerate()} disabled={generating || applying || !prompt.trim()}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-500" />}
              {generating ? 'Generating...' : generatedWorkflow ? 'Generate Again' : 'Generate'}
            </Button>
            {generatedWorkflow ? (
              isCanvasMode ? (
                <Button type="button" onClick={() => void handleApply()} disabled={applying || generating || !onApply}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {applying ? 'Applying...' : applyLabel}
                </Button>
              ) : (
                <Button type="button" onClick={handleOpenCanvas} disabled={!generatedWorkflow.workflowId || generating}>
                  Open in Canvas
                </Button>
              )
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
