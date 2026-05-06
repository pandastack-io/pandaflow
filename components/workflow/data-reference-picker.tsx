'use client';

import { useMemo, type ComponentType } from 'react';
import * as LucideIcons from 'lucide-react';
import { Database, FileJson, Variable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNodeByType, nodeRegistry } from '@/lib/nodes/registry';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { NodeType } from '@/types/nodes';
import { cn } from '@/lib/utils';

interface DataReferencePickerProps {
  nodeId: string;
  onSelect: (expression: string) => void;
}

interface ReferenceGroup {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  references: string[];
}

export function getPaths(obj: unknown, prefix = '', maxDepth = 4, seen = new WeakSet<object>()): string[] {
  if (maxDepth === 0 || typeof obj !== 'object' || obj === null) {
    return prefix ? [prefix] : [];
  }

  if (seen.has(obj)) {
    return prefix ? [prefix] : [];
  }

  seen.add(obj);

  const paths: string[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    paths.push(fullKey);
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      paths.push(...getPaths(val, fullKey, maxDepth - 1, seen));
    }
  }
  return paths;
}

function getAncestorIds(nodeId: string, edges: ReturnType<typeof useWorkflowStore.getState>['edges']) {
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.target !== currentId || visited.has(edge.source)) {
        continue;
      }

      visited.add(edge.source);
      queue.push(edge.source);
    }
  }

  return Array.from(visited);
}

export function DataReferencePicker({ nodeId, onSelect }: DataReferencePickerProps) {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const executionOutputs = useWorkflowStore((state) => state.executionOutputs);
  const workflowVariables = useWorkflowStore((state) => state.workflowVariables);

  const directUpstreamIds = useMemo(
    () => Array.from(new Set(edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source))),
    [edges, nodeId]
  );

  const ancestorIds = useMemo(() => getAncestorIds(nodeId, edges), [edges, nodeId]);

  const referenceGroups = useMemo<ReferenceGroup[]>(() => {
    return directUpstreamIds.flatMap((upstreamId) => {
      const upstreamNode = nodes.find((node) => node.id === upstreamId);
      if (!upstreamNode) {
        return [];
      }

      const registryEntry = getNodeByType(upstreamNode.data.type) ?? nodeRegistry[upstreamNode.data.type];
      const NodeIcon =
        (registryEntry?.icon
          ? (LucideIcons[registryEntry.icon as keyof typeof LucideIcons] as ComponentType<{ className?: string }> | undefined)
          : undefined) ?? FileJson;

      const outputPaths = getPaths(executionOutputs[upstreamId]?.output);
      const staticPaths = (registryEntry?.outputs ?? []).map((outputDef) =>
        outputDef.name === 'output' ? `${upstreamId}.output` : `${upstreamId}.output.${outputDef.name}`
      );

      const references = Array.from(
        new Set(
          outputPaths.length > 0
            ? outputPaths.map((path) => `${upstreamId}.output.${path}`)
            : staticPaths.length > 0
              ? staticPaths
              : [`${upstreamId}.output`]
        )
      );

      return [
        {
          id: upstreamId,
          label: upstreamNode.data.config?.label || registryEntry?.name || upstreamId,
          icon: NodeIcon,
          references,
        },
      ];
    });
  }, [directUpstreamIds, executionOutputs, nodes]);

  const variableReferences = useMemo(() => {
    const names = new Set(
      workflowVariables
        .map((variable) => variable.name)
        .filter((name): name is string => Boolean(name))
    );

    ancestorIds.forEach((ancestorId) => {
      const ancestorNode = nodes.find((node) => node.id === ancestorId);
      if (ancestorNode?.data.type !== NodeType.UTILITY_VARIABLE) {
        return;
      }

      const name = ancestorNode.data.config?.name;
      if (typeof name === 'string' && name.trim()) {
        names.add(name.trim());
      }
    });

    return Array.from(names)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({
        key: name,
        expression: `variables.${name}`,
      }));
  }, [ancestorIds, nodes, workflowVariables]);

  if (referenceGroups.length === 0 && variableReferences.length === 0) {
    return <div className="text-xs text-muted-foreground">Connect upstream nodes to reference their outputs or variables.</div>;
  }

  return (
    <div className="space-y-3">
      {variableReferences.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Variable className="h-3.5 w-3.5" />
            Workflow Variables
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-2">
            <div className="grid gap-1">
              {variableReferences.map((reference) => (
                <Button
                  key={reference.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn('h-auto justify-start px-2 py-1 font-mono text-[11px] text-violet-500 hover:text-violet-400')}
                  onClick={() => onSelect(reference.expression)}
                >
                  {`{{${reference.expression}}}`}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {referenceGroups.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Database className="h-3.5 w-3.5" />
            Upstream node outputs
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {referenceGroups.map((group) => {
              const Icon = group.icon;

              return (
                <div key={group.id} className="rounded-lg border border-border/70 bg-muted/20 p-2">
                  <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{group.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{group.id}</span>
                  </div>
                  <div className="space-y-1">
                    {group.references.map((reference) => (
                      <Button
                        key={reference}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('h-auto w-full justify-start px-2 py-1 font-mono text-[11px] text-emerald-400 hover:text-emerald-300')}
                        onClick={() => onSelect(reference)}
                      >
                        {`{{${reference}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
