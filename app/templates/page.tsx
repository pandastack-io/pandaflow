'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Download,
  Eye,
  LayoutGrid,
  Loader2,
  Plug,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { MainLayout } from '@/components/layouts/main-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { workflowTemplates, getAllCategories, type WorkflowTemplate } from '@/lib/templates/templates-data';
import { getNodeByType } from '@/lib/nodes/registry';
import { NodeType } from '@/types/nodes';

const DEFAULT_ICON = 'Box';

type TemplateNode = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: {
    type?: NodeType;
    category?: string;
    config?: Record<string, unknown>;
    label?: string;
  };
};

type TemplateEdge = {
  id: string;
  source: string;
  target: string;
};

const difficultyClasses = {
  beginner: 'border-green-200 bg-green-100 text-green-700',
  intermediate: 'border-yellow-200 bg-yellow-100 text-yellow-700',
  advanced: 'border-red-200 bg-red-100 text-red-700',
} as const;

const categoryIconMap: Array<{ match: (category: string) => boolean; icon: LucideIcon }> = [
  { match: (category) => category.includes('Automation'), icon: Sparkles },
  { match: (category) => category.includes('AI') || category.includes('Chat'), icon: Bot },
  { match: (category) => category.includes('Agent'), icon: Cpu },
  { match: (category) => category.includes('Data'), icon: Database },
  { match: (category) => category.includes('Integration'), icon: Plug },
];

function getTemplateNodes(template: WorkflowTemplate): TemplateNode[] {
  return (template.definition?.nodes ?? []) as TemplateNode[];
}

function getTemplateEdges(template: WorkflowTemplate): TemplateEdge[] {
  return (template.definition?.edges ?? []) as TemplateEdge[];
}

function getTemplateNodeType(node: TemplateNode): NodeType {
  return (node.data?.type ?? node.type) as NodeType;
}

function getTemplateNodeInfo(node: TemplateNode) {
  return getNodeByType(getTemplateNodeType(node));
}

function getTemplateNodeLabel(node: TemplateNode): string {
  const configLabel = typeof node.data?.config?.label === 'string' ? node.data.config.label : undefined;
  return configLabel ?? node.data?.label ?? getTemplateNodeInfo(node)?.name ?? getTemplateNodeType(node);
}

function getTemplateNodeColor(node: TemplateNode): string {
  return getTemplateNodeInfo(node)?.color ?? '#94a3b8';
}

function getTemplateNodeCategory(node: TemplateNode): string {
  return String(node.data?.category ?? getTemplateNodeInfo(node)?.category ?? getTemplateNodeType(node).split('.')[0]);
}

function formatRequirement(name: string) {
  return name
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRequirements(template: WorkflowTemplate) {
  if (template.requirements?.length) {
    return template.requirements;
  }

  return (template.definition?.envVars ?? []).map((envVar) => formatRequirement(envVar.name));
}

function getCategoryIcon(category: string) {
  return categoryIconMap.find((entry) => entry.match(category))?.icon ?? LayoutGrid;
}

function getTemplateIcon(iconName: string) {
  return (LucideIcons[iconName as keyof typeof LucideIcons] || LucideIcons.Box) as LucideIcon;
}

function normalizeTemplateNode(raw: TemplateNode) {
  const nodeType = getTemplateNodeType(raw);
  const info = getNodeByType(nodeType);

  return {
    id: raw.id,
    type: 'custom',
    position: raw.position ?? { x: 100, y: 100 },
    data: {
      type: nodeType,
      category: info?.category ?? nodeType.split('.')[0],
      config: raw.data?.config ?? info?.defaultConfig ?? {},
      label: raw.data?.label ?? info?.name ?? nodeType,
      status: 'idle',
    },
  };
}

function MiniFlowPreview({ template }: { template: WorkflowTemplate }) {
  const sortedNodes = [...getTemplateNodes(template)].sort((a, b) => {
    const ax = a.position?.x ?? 0;
    const bx = b.position?.x ?? 0;
    if (ax === bx) {
      return (a.position?.y ?? 0) - (b.position?.y ?? 0);
    }
    return ax - bx;
  });

  if (sortedNodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-4 text-xs text-muted-foreground">
        Preview unavailable
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-4">
      <div className="flex items-center gap-1 overflow-hidden">
        {sortedNodes.map((node, index) => (
          <div key={node.id} className="flex min-w-0 items-center gap-1.5">
            <div
              className="h-3.5 w-3.5 rounded-full ring-4 ring-background transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: getTemplateNodeColor(node) }}
              title={getTemplateNodeLabel(node)}
            />
            {index < sortedNodes.length - 1 && <div className="h-0.5 w-6 rounded-full bg-border transition-all duration-300 group-hover:bg-primary/50" />}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{sortedNodes.length} nodes</span>
        <span>{getTemplateEdges(template).length} connections</span>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [usingId, setUsingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);
  const router = useRouter();

  const categories = useMemo(() => getAllCategories(), []);

  const categoryTabs = useMemo(
    () => [
      { value: 'all', label: 'All', count: workflowTemplates.length, Icon: LayoutGrid },
      ...categories.map((category) => ({
        value: category,
        label: category,
        count: workflowTemplates.filter((template) => template.category === category).length,
        Icon: getCategoryIcon(category),
      })),
    ],
    [categories]
  );

  const featuredTemplates = useMemo(
    () => workflowTemplates.filter((template) => template.featured && template.definition).slice(0, 3),
    []
  );

  const filteredTemplates = useMemo(() => {
    return workflowTemplates
      .filter((template) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          query.length === 0 ||
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
        const matchesDifficulty = difficultyFilter === 'all' || template.difficulty === difficultyFilter;
        return matchesSearch && matchesCategory && matchesDifficulty;
      })
      .sort((left, right) => {
        const leftScore = Number(Boolean(left.definition)) + Number(Boolean(left.featured));
        const rightScore = Number(Boolean(right.definition)) + Number(Boolean(right.featured));
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        return left.name.localeCompare(right.name);
      });
  }, [categoryFilter, difficultyFilter, searchQuery]);

  const readyTemplatesCount = useMemo(() => workflowTemplates.filter((template) => Boolean(template.definition)).length, []);

  const handleUseTemplate = async (template: WorkflowTemplate) => {
    if (!template.definition) {
      return;
    }

    setUsingId(template.id);
    try {
      const normalizedDefinition = {
        ...template.definition,
        nodes: getTemplateNodes(template).map(normalizeTemplateNode),
      };
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          definition: normalizedDefinition,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        router.push(`/workflows/${json.data.id}`);
      } else {
        alert(json.error || 'Failed to create workflow from template');
      }
    } catch {
      alert('Network error — please try again');
    } finally {
      setUsingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workflow Templates</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Explore richer real-world templates inspired by leading agent marketplaces and tailored to this builder&apos;s native nodes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="min-w-[130px] border-primary/20 bg-primary/10 shadow-sm dark:border-primary/30 dark:bg-primary/20">
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{workflowTemplates.length}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Total templates</div>
              </CardContent>
            </Card>
            <Card className="min-w-[130px] border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{readyTemplatesCount}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Ready to use</div>
              </CardContent>
            </Card>
            <Card className="col-span-2 min-w-[130px] border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950/40 sm:col-span-1">
              <CardContent className="p-4">
                <div className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{featuredTemplates.length}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Featured starters</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {featuredTemplates.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Featured templates</h2>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {featuredTemplates.map((template) => {
                const Icon = getTemplateIcon(template.icon);
                const gradient = `linear-gradient(135deg, ${template.color}20 0%, transparent 70%)`;
                return (
                  <Card key={template.id} className="overflow-hidden border shadow-sm">
                    <CardContent className="p-0">
                      <div className="border-b p-6" style={{ background: gradient }}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl border bg-background/80 p-3 shadow-sm">
                              <Icon className="h-5 w-5" style={{ color: template.color }} />
                            </div>
                            <div>
                              <div className="font-semibold">{template.name}</div>
                              <div className="text-sm text-muted-foreground">{template.category}</div>
                            </div>
                          </div>
                          <Badge className={cn('capitalize', difficultyClasses[template.difficulty])}>{template.difficulty}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      <div className="space-y-4 p-6">
                        <MiniFlowPreview template={template} />
                        <div className="flex flex-wrap gap-2">
                          {template.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="rounded-full text-xs text-muted-foreground">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {template.estimatedTime}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setPreviewTemplate(template)}>
                              <Eye className="h-3.5 w-3.5" />
                              Preview
                            </Button>
                            <Button size="sm" onClick={() => handleUseTemplate(template)} disabled={usingId === template.id}>
                              {usingId === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              Use
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <section className="mb-6 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by template name, description, or tags..."
                className="pl-9"
              />
            </div>
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
              {categoryTabs.map(({ value, label, count, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-full border border-input bg-background px-4 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-primary/5"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </section>

        {filteredTemplates.length > 0 ? (
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => {
              const Icon = getTemplateIcon(template.icon);
              const nodeCount = getTemplateNodes(template).length;
              const hasDefinition = Boolean(template.definition);

              return (
                <Card
                  key={template.id}
                  className={cn(
                    'group border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg',
                    hasDefinition ? 'cursor-pointer' : 'opacity-80'
                  )}
                  onClick={() => hasDefinition && setPreviewTemplate(template)}
                >
                  <CardHeader className="space-y-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-xl border bg-muted/40 p-3">
                          <Icon className="h-5 w-5" style={{ color: template.color }} />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="line-clamp-1 text-base">{template.name}</CardTitle>
                          <CardDescription className="mt-1 line-clamp-2">{template.description}</CardDescription>
                        </div>
                      </div>
                      <Badge className={cn('shrink-0 capitalize', difficultyClasses[template.difficulty])}>{template.difficulty}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="rounded-full">{template.category}</Badge>
                      <Badge variant="outline" className="rounded-full">{nodeCount || 'No'} nodes</Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {template.estimatedTime}
                      </span>
                      {!hasDefinition && <Badge variant="outline" className="rounded-full text-muted-foreground">Coming soon</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MiniFlowPreview template={template} />
                    <div className="flex flex-wrap gap-2">
                      {template.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="outline" className="rounded-full text-xs text-muted-foreground">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!hasDefinition}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (hasDefinition) {
                            setPreviewTemplate(template);
                          }
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        disabled={!hasDefinition || usingId === template.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUseTemplate(template);
                        }}
                      >
                        {usingId === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {hasDefinition ? 'Use' : 'Unavailable'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-muted p-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No templates found</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Try a broader search, switch categories, or clear the difficulty filter.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Showing {filteredTemplates.length} of {workflowTemplates.length} templates · {readyTemplatesCount} can be launched instantly
        </div>
      </div>

      <Dialog open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        {previewTemplate && (
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <div className="mb-3 flex items-start gap-3">
                <div className="rounded-xl border bg-muted/40 p-3">
                  {(() => {
                    const Icon = getTemplateIcon(previewTemplate.icon);
                    return <Icon className="h-5 w-5" style={{ color: previewTemplate.color }} />;
                  })()}
                </div>
                <div>
                  <DialogTitle>{previewTemplate.name}</DialogTitle>
                  <DialogDescription className="mt-1">{previewTemplate.description}</DialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full">{previewTemplate.category}</Badge>
                <Badge className={cn('rounded-full capitalize', difficultyClasses[previewTemplate.difficulty])}>{previewTemplate.difficulty}</Badge>
                <Badge variant="outline" className="rounded-full">{getTemplateNodes(previewTemplate).length} nodes</Badge>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-sm font-semibold">Flow preview</h3>
                <div className="overflow-x-auto rounded-xl border bg-muted/20 p-4">
                  <div className="flex min-w-max items-center gap-3">
                    {getTemplateNodes(previewTemplate)
                      .slice()
                      .sort((a, b) => {
                        const ax = a.position?.x ?? 0;
                        const bx = b.position?.x ?? 0;
                        if (ax === bx) {
                          return (a.position?.y ?? 0) - (b.position?.y ?? 0);
                        }
                        return ax - bx;
                      })
                      .map((node, index, sortedNodes) => {
                        const info = getTemplateNodeInfo(node);
                        const Icon = getTemplateIcon(info?.icon ?? DEFAULT_ICON);
                        return (
                          <div key={node.id} className="flex items-center gap-3">
                            <div className="min-w-[180px] rounded-xl border bg-background p-4 shadow-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <div className="rounded-lg bg-muted p-2">
                                  <Icon className="h-4 w-4" style={{ color: info?.color ?? '#94a3b8' }} />
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{getTemplateNodeLabel(node)}</div>
                                  <div className="text-xs capitalize text-muted-foreground">{String(getTemplateNodeCategory(node))}</div>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">{getTemplateNodeType(node)}</div>
                            </div>
                            {index < sortedNodes.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Connections</h3>
                  <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                    {getTemplateEdges(previewTemplate).length > 0 ? (
                      getTemplateEdges(previewTemplate).map((edge) => {
                        const source = getTemplateNodes(previewTemplate).find((node) => node.id === edge.source);
                        const target = getTemplateNodes(previewTemplate).find((node) => node.id === edge.target);
                        return (
                          <div key={edge.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                            <span className="font-medium">{source ? getTemplateNodeLabel(source) : edge.source}</span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="font-medium">{target ? getTemplateNodeLabel(target) : edge.target}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-muted-foreground">No connection preview available.</div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Requirements</h3>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    {getRequirements(previewTemplate).length > 0 ? (
                      <div className="space-y-2">
                        {getRequirements(previewTemplate).map((requirement) => (
                          <div key={requirement} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span>Requires: {requirement}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No external secrets required for the base template.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
                Close
              </Button>
              <Button
                onClick={() => previewTemplate && handleUseTemplate(previewTemplate)}
                disabled={!previewTemplate.definition || usingId === previewTemplate.id}
              >
                {usingId === previewTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Use Template
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </MainLayout>
  );
}
