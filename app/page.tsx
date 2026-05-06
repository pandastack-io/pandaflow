import Link from 'next/link';
import type { IconType } from 'react-icons';
import { SiOpenai, SiAnthropic, SiSlack, SiGithub, SiPostgresql, SiRedis, SiPython, SiNotion, SiAirtable, SiGoogledrive, SiLangchain } from 'react-icons/si';
import * as LucideIcons from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Calculator,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileText,
  Filter,
  GitBranch,
  GitPullRequest,
  Globe,
  HardDrive,
  Layers,
  Lock,
  Mail,
  Merge,
  MessageSquare,
  Package,
  Plug,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Webhook,
  Workflow,
  Zap,
  createLucideIcon,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getNodeByType } from '@/lib/nodes/registry';
import { type WorkflowTemplate, workflowTemplates } from '@/lib/templates/templates-data';
import { cn } from '@/lib/utils';
import { NodeType } from '@/types/nodes';

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type HomeNodeBadge = {
  icon: LucideIcon | IconType;
  label: string;
  color: keyof typeof nodeColorClasses;
};

type TemplateNode = {
  id: string;
  type: string;
  data?: {
    type?: NodeType;
    label?: string;
    config?: {
      label?: string;
    };
  };
  position?: {
    x: number;
    y: number;
  };
};

type TemplateEdge = {
  id: string;
  source: string;
  target: string;
};

const Github = createLucideIcon('Github', [
  [
    'path',
    {
      d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
      fill: 'currentColor',
      stroke: 'none',
    },
  ],
]);

const githubUrl = 'https://github.com/pandastack-io/pandaflow';
const contributingUrl = 'https://github.com/pandastack-io/pandaflow/blob/main/CONTRIBUTING.md';
const licenseUrl = 'https://github.com/pandastack-io/pandaflow/blob/main/LICENSE';

const stats = [
  { value: '160+', label: 'Node Types' },
  { value: '130+', label: 'Templates' },
  { value: 'MIT', label: 'Licensed' },
  { value: '100%', label: 'Open Source' },
] as const;

const isolationBullets: Feature[] = [
  {
    icon: ShieldCheck,
    title: 'Zero cross-contamination',
    description: 'Each run gets an isolated Sandflare microVM with its own process, memory, and execution context.',
  },
  {
    icon: Zap,
    title: 'Fast cold starts',
    description: 'Sandflare microVMs start quickly so workflows can move from trigger to execution without long waits.',
  },
  {
    icon: RefreshCcw,
    title: 'Clean state on every run',
    description: 'Every execution starts from a fresh environment and ends with memory wiped on termination.',
  },
  {
    icon: Globe,
    title: 'Any language runtime',
    description: 'Run Python, JavaScript, Bash, and other supported runtimes inside the same workflow graph.',
  },
  {
    icon: Package,
    title: 'Install packages per execution',
    description: 'Bring the exact dependencies your workflow needs without polluting other runs.',
  },
];

const features: Feature[] = [
  {
    title: 'Visual workflow builder',
    description: 'Drag, connect, and configure workflows in a React Flow canvas built for multi-step agent systems.',
    icon: Workflow,
  },
  {
    title: 'Sandflare execution',
    description: 'Run every workflow in an isolated Sandflare microVM so code execution stays clean and predictable.',
    icon: Cloud,
  },
  {
    title: 'Flexible model routing',
    description: 'Use GPT-4, Claude, Mistral, and other providers across reasoning, chat, and tool-calling nodes.',
    icon: Brain,
  },
  {
    title: 'Data + memory nodes',
    description: 'Mix vector search, key-value memory, databases, and document loaders in a single graph.',
    icon: Database,
  },
  {
    title: 'Deployment-ready templates',
    description: 'Start from real templates, adapt a few nodes, and ship workflows faster without a blank canvas.',
    icon: Sparkles,
  },
  {
    title: 'Open source foundation',
    description: 'Self-host, inspect the code, and extend PandaFlow without vendor lock-in or closed components.',
    icon: Lock,
  },
];

const nodeColorClasses = {
  indigo: 'text-indigo-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  red: 'text-red-400',
  pink: 'text-pink-400',
  yellow: 'text-yellow-400',
  sky: 'text-sky-400',
  green: 'text-green-400',
  zinc: 'text-zinc-300',
} as const;

const categoryBadgeClasses: Record<string, string> = {
  Automation: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200',
  'AI & Chat': 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  Data: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
  Integrations: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
  Agents: 'border-purple-500/20 bg-purple-500/10 text-purple-200',
};

const difficultyClasses = {
  beginner: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  intermediate: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  advanced: 'border-red-500/20 bg-red-500/10 text-red-300',
} as const;

const nodeRowOne: HomeNodeBadge[] = [
  { icon: SiOpenai,    label: 'GPT-4',         color: 'emerald' },
  { icon: SiAnthropic, label: 'Claude',         color: 'orange'  },
  { icon: Sparkles,    label: 'Mistral',        color: 'purple'  },
  { icon: Globe,       label: 'HTTP Request',   color: 'blue'    },
  { icon: SiPython,    label: 'Python Sandbox', color: 'yellow'  },
  { icon: FileText,    label: 'PDF Loader',     color: 'red'     },
  { icon: Database,    label: 'Pinecone',       color: 'pink'    },
  { icon: Webhook,     label: 'Webhook',        color: 'indigo'  },
  { icon: Mail,        label: 'Email',          color: 'sky'     },
  { icon: SiSlack,     label: 'Slack',          color: 'green'   },
  { icon: SiGithub,    label: 'GitHub',         color: 'zinc'    },
  { icon: SiPostgresql,label: 'PostgreSQL',     color: 'blue'    },
  { icon: SiRedis,     label: 'Redis',          color: 'red'     },
];

const nodeRowTwo: HomeNodeBadge[] = [
  { icon: Calculator,    label: 'Calculator',       color: 'orange'  },
  { icon: Search,        label: 'Web Search',       color: 'sky'     },
  { icon: SiNotion,      label: 'Notion',           color: 'zinc'    },
  { icon: SiGoogledrive, label: 'Google Drive',     color: 'blue'    },
  { icon: SiAirtable,    label: 'Airtable',         color: 'yellow'  },
  { icon: HardDrive,     label: 'Vector Store',     color: 'purple'  },
  { icon: Cpu,           label: 'Agent Router',     color: 'emerald' },
  { icon: SiLangchain,   label: 'LangChain',        color: 'indigo'  },
  { icon: BarChart3,     label: 'LangFuse',         color: 'pink'    },
  { icon: Code2,         label: 'Code Execution',   color: 'yellow'  },
  { icon: GitBranch,     label: 'Conditional Logic',color: 'green'   },
  { icon: Filter,        label: 'Filters',          color: 'indigo'  },
  { icon: Merge,         label: 'Merge Results',    color: 'purple'  },
];

const homeTemplates = workflowTemplates.filter((template) => Boolean(template.definition)).slice(0, 6);

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-zinc-300">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-zinc-400 sm:text-lg">{description}</p>
    </div>
  );
}

function getTemplateNodes(template: WorkflowTemplate): TemplateNode[] {
  return (template.definition?.nodes ?? []) as TemplateNode[];
}

function getTemplateEdges(template: WorkflowTemplate): TemplateEdge[] {
  return (template.definition?.edges ?? []) as TemplateEdge[];
}

function getTemplateNodeType(node: TemplateNode): NodeType {
  return (node.data?.type ?? node.type) as NodeType;
}

function getTemplateNodeLabel(node: TemplateNode): string {
  const configuredLabel = node.data?.config?.label;
  if (configuredLabel) {
    return configuredLabel;
  }

  const inlineLabel = node.data?.label;
  if (inlineLabel) {
    return inlineLabel;
  }

  return getNodeByType(getTemplateNodeType(node))?.name ?? getTemplateNodeType(node);
}

function getTemplateNodeColor(node: TemplateNode): string {
  return getNodeByType(getTemplateNodeType(node))?.color ?? '#94a3b8';
}

function getTemplateIcon(iconName: string) {
  return (LucideIcons[iconName as keyof typeof LucideIcons] || LucideIcons.Box) as LucideIcon;
}

function TemplateMiniPreview({ template }: { template: WorkflowTemplate }) {
  const nodes = [...getTemplateNodes(template)].sort((left, right) => {
    const leftX = left.position?.x ?? 0;
    const rightX = right.position?.x ?? 0;
    if (leftX === rightX) {
      return (left.position?.y ?? 0) - (right.position?.y ?? 0);
    }
    return leftX - rightX;
  });

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-4">
      <div className="flex items-center gap-1 overflow-hidden">
        {nodes.slice(0, 5).map((node, index) => (
          <div key={node.id} className="flex min-w-0 items-center gap-1.5">
            <div
              className="h-3.5 w-3.5 rounded-full ring-4 ring-zinc-950 transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: getTemplateNodeColor(node) }}
              title={getTemplateNodeLabel(node)}
            />
            {index < Math.min(nodes.length, 5) - 1 ? <div className="h-0.5 w-6 rounded-full bg-white/10" /> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{nodes.length} nodes</span>
        <span>{getTemplateEdges(template).length} connections</span>
      </div>
    </div>
  );
}

function CanvasNode({
  x, y, label, category, colorClass, iconColorClass, IconComp, selected = false,
}: {
  x: number; y: number; label: string; category: string;
  colorClass: string; iconColorClass: string;
  IconComp: LucideIcon; selected?: boolean;
}) {
  return (
    <div
      className={`absolute flex items-center gap-3 rounded-xl border bg-zinc-900 px-3 py-3 shadow-lg ${selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-zinc-700/80'}`}
      style={{ left: x, top: y, width: 192 }}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
        <IconComp className={`h-4 w-4 ${iconColorClass}`} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-zinc-500">{category}</p>
      </div>
    </div>
  );
}

function WorkflowPreview() {
  const nW = 192;
  const nH = 56;
  const mid = (y: number) => y + nH / 2;

  const nodes = {
    trigger:   { x: 32,  y: 172 },
    router:    { x: 272, y: 172 },
    gpt4:      { x: 512, y: 60  },
    retriever: { x: 512, y: 284 },
    slack:     { x: 752, y: 60  },
    python:    { x: 752, y: 284 },
    store:     { x: 992, y: 284 },
  };

  type NodeKey = keyof typeof nodes;

  function edgePath(src: NodeKey, dst: NodeKey, color: string, dash = false) {
    const s = nodes[src];
    const d = nodes[dst];
    const x1 = s.x + nW;
    const y1 = mid(s.y);
    const x2 = d.x;
    const y2 = mid(d.y);
    const mx = (x1 + x2) / 2;
    const path = y1 === y2 ? `M${x1},${y1} H${x2}` : `M${x1},${y1} H${mx} V${y2} H${x2}`;
    return (
      <path
        key={`${src}-${dst}`}
        d={path}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={dash ? '6 6' : undefined}
      />
    );
  }

  function connDot(nx: number, ny: number, side: 'left' | 'right', color: string) {
    const cx = side === 'right' ? nx + nW : nx;
    const cy = mid(ny);
    return <circle key={`d-${nx}-${ny}-${side}`} cx={cx} cy={cy} r="4.5" fill={color} />;
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[#0a0a0a] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_120px_rgba(79,70,229,0.22)]">
      {/* dot grid — matches the real canvas */}
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, #3f3f46 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(99,102,241,0.10),transparent_55%),radial-gradient(ellipse_at_75%_60%,rgba(16,185,129,0.07),transparent_50%)]" />
      {/* app bar label */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-400 backdrop-blur">
        <Workflow className="h-3.5 w-3.5" />
        Competitor Intelligence Agent
      </div>

      {/* canvas area — scaled SVG + absolutely positioned node divs */}
      <div className="relative h-[400px] w-full">
        {/* SVG layer: edges */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1220 400" preserveAspectRatio="xMidYMid meet" fill="none">
          {edgePath('trigger',   'router',    'rgba(99,102,241,0.85)')}
          {edgePath('router',    'gpt4',      'rgba(139,92,246,0.85)')}
          {edgePath('router',    'retriever', 'rgba(244,114,182,0.8)', true)}
          {edgePath('gpt4',      'slack',     'rgba(16,185,129,0.85)')}
          {edgePath('retriever', 'python',    'rgba(56,189,248,0.85)')}
          {edgePath('python',    'store',     'rgba(245,158,11,0.85)')}

          {/* connection dots */}
          {connDot(nodes.trigger.x,   nodes.trigger.y,   'right', 'rgba(99,102,241,0.9)')}
          {connDot(nodes.router.x,    nodes.router.y,    'left',  'rgba(99,102,241,0.9)')}
          {connDot(nodes.router.x,    nodes.router.y,    'right', 'rgba(139,92,246,0.9)')}
          {connDot(nodes.gpt4.x,      nodes.gpt4.y,      'left',  'rgba(139,92,246,0.9)')}
          {connDot(nodes.retriever.x, nodes.retriever.y, 'left',  'rgba(244,114,182,0.9)')}
          {connDot(nodes.gpt4.x,      nodes.gpt4.y,      'right', 'rgba(16,185,129,0.9)')}
          {connDot(nodes.slack.x,     nodes.slack.y,     'left',  'rgba(16,185,129,0.9)')}
          {connDot(nodes.retriever.x, nodes.retriever.y, 'right', 'rgba(56,189,248,0.9)')}
          {connDot(nodes.python.x,    nodes.python.y,    'left',  'rgba(56,189,248,0.9)')}
          {connDot(nodes.python.x,    nodes.python.y,    'right', 'rgba(245,158,11,0.9)')}
          {connDot(nodes.store.x,     nodes.store.y,     'left',  'rgba(245,158,11,0.9)')}
        </svg>

        {/* Absolutely positioned node cards — scaled via SVG viewBox */}
        {/* We use a 1220-wide design scaled to container width */}
        <div className="absolute inset-0 overflow-visible" style={{ transform: 'none' }}>
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 1220 400" preserveAspectRatio="xMidYMid meet">
            {/* node cards as foreignObject so they scale with viewBox */}
            <foreignObject x={nodes.trigger.x} y={nodes.trigger.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="Webhook Trigger" category="trigger" colorClass="bg-emerald-500/15" iconColorClass="text-emerald-400" IconComp={Webhook} />
            </foreignObject>
            <foreignObject x={nodes.router.x} y={nodes.router.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="Intent Router" category="control" colorClass="bg-indigo-500/15" iconColorClass="text-indigo-400" IconComp={GitBranch} selected />
            </foreignObject>
            <foreignObject x={nodes.gpt4.x} y={nodes.gpt4.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="GPT-4 Planner" category="ai" colorClass="bg-violet-500/15" iconColorClass="text-violet-400" IconComp={Bot} />
            </foreignObject>
            <foreignObject x={nodes.retriever.x} y={nodes.retriever.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="Vector Search" category="memory" colorClass="bg-pink-500/15" iconColorClass="text-pink-400" IconComp={Database} />
            </foreignObject>
            <foreignObject x={nodes.slack.x} y={nodes.slack.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="Slack Notify" category="output" colorClass="bg-emerald-500/15" iconColorClass="text-emerald-400" IconComp={MessageSquare} />
            </foreignObject>
            <foreignObject x={nodes.python.x} y={nodes.python.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="Python Sandbox" category="sandflare" colorClass="bg-sky-500/15" iconColorClass="text-sky-400" IconComp={TerminalSquare} />
            </foreignObject>
            <foreignObject x={nodes.store.x} y={nodes.store.y} width="192" height="56">
              <CanvasNode x={0} y={0} label="Store Result" category="memory" colorClass="bg-amber-500/15" iconColorClass="text-amber-400" IconComp={HardDrive} />
            </foreignObject>
          </svg>
        </div>

        {/* status bar at bottom */}
        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-emerald-500/20 bg-zinc-900/80 px-4 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-xs font-medium text-emerald-300">
            {['microVM booted', 'workflow validated', 'secrets mounted', 'memory isolated'].map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function MarqueeRow({ items, direction }: { items: HomeNodeBadge[]; direction: 'left' | 'right' }) {
  const animationClass = direction === 'left' ? 'marquee-track-left' : 'marquee-track-right';

  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className={`flex min-w-max gap-3 py-3 ${animationClass}`}>
        {[...items, ...items].map((item, index) => {
          const Icon = item.icon;

          return (
            <span
              key={`${item.label}-${index}`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-zinc-800 px-4 py-2 text-sm text-zinc-200"
            >
              <Icon className={cn('h-4 w-4', nodeColorClasses[item.color])} />
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Cloud coming soon banner */}
      <div className="flex items-center justify-center gap-2 border-b border-indigo-500/20 bg-indigo-950/60 px-4 py-2 text-center text-xs text-indigo-200 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
        <span>☁️ PandaFlow Cloud is coming soon — hosted &amp; managed by PandastackIO Inc.</span>
        <a href="#open-source" className="ml-1 underline underline-offset-2 hover:text-white transition">Learn more →</a>
      </div>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-3 text-lg tracking-tight text-white">
            <img src="/pandaflow-logo.png" alt="PandaFlow" className="h-7 w-7" />
            <span className="font-bold text-white">PandaFlow</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#nodes" className="transition hover:text-white">
              Nodes
            </a>
            <a href="#templates" className="transition hover:text-white">
              Templates
            </a>
            <a href="#open-source" className="transition hover:text-white">
              Open Source
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/10 sm:inline-flex"
            >
              <Github className="h-4 w-4" />
              Star on GitHub
            </Link>
            <Link href="/sign-in" className="hidden text-sm text-zinc-300 transition hover:text-white sm:inline-flex">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="overflow-x-hidden">
        <section className="relative isolate">
          <div className="absolute inset-0 marketing-grid opacity-25" />
          <div className="absolute inset-0 marketing-noise opacity-40" />
          <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute right-[10%] top-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                ✨ Open source · MIT licensed · by PandastackIO Inc.
              </div>
              <h1 className="mt-8 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                The Open Source AI Agent Workflow Builder
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-400 sm:text-xl">
                Build and deploy AI agents visually. Connect 160+ nodes in a drag-and-drop canvas. Every
                execution runs in an isolated Sandflare microVM — no shared state, no cross-contamination.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Start Building
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/10"
                >
                  <Github className="h-4 w-4" />
                  View on GitHub
                </Link>
              </div>
            </div>

            <div className="mt-16 lg:mt-20">
              <WorkflowPreview />
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-zinc-900/80">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center lg:text-left">
                <div className="text-3xl font-semibold tracking-tight text-white">{stat.value}</div>
                <div className="mt-2 text-sm text-zinc-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="relative isolate px-6 py-24 lg:px-8">
          <div className="absolute inset-0 marketing-grid opacity-20" />
          <div className="relative mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Sandflare isolation"
              title="Every execution starts clean."
              description="PandaFlow runs each workflow execution in a dedicated Sandflare microVM so secrets, memory, packages, and code stay isolated from every other run."
            />

            <div className="mt-16 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900/90 shadow-2xl shadow-emerald-500/5">
                <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="ml-3 text-sm text-zinc-500">$</span>
                </div>
                <div className="space-y-2 bg-black px-5 py-6 font-mono text-sm leading-7 text-zinc-300">
                  <div className="text-zinc-500"># Invoke a deployed agent via its identity token</div>
                  <div className="mt-1">{`$ curl -X POST https://your-host/api/agents/invoke \\`}</div>
                  <div>{`  -H "Authorization: Bearer agt_••••••••••••••••" \\`}</div>
                  <div>{`  -d '{"input": {"query": "hello"}}'`}</div>
                  <div className="mt-3 text-zinc-500"># Agent OS handles the rest</div>
                  <div className="text-emerald-400">[✓] Agent identity verified</div>
                  <div className="text-emerald-400">[✓] Spawning Sandflare microVM...</div>
                  <div className="text-emerald-400">[✓] Secrets mounted (read-only)</div>
                  <div className="text-emerald-400">[✓] Workflow executing...</div>
                  <div className="text-emerald-400">[✓] microVM terminated — memory wiped</div>
                </div>
              </div>

              <div className="grid gap-4">
                {isolationBullets.map((bullet) => (
                  <div
                    key={bullet.title}
                    className="rounded-[24px] border border-white/10 bg-zinc-900/80 p-5 transition hover:border-emerald-500/20 hover:bg-zinc-900"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                        <bullet.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{bullet.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-zinc-400">{bullet.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="px-6 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Feature set"
              title="Everything you need to build production agents"
              description="Design workflows visually, run them with Sandflare isolation, and ship reliable agent systems with the building blocks serious teams need."
            />

            <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-[28px] border border-zinc-800 bg-zinc-900 p-6 transition hover:border-zinc-700 hover:bg-zinc-800/80"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-indigo-300">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="nodes" className="border-y border-white/10 bg-zinc-950/80 px-6 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Node library"
              title="160+ nodes. Serious depth."
              description="From LLMs and loaders to memory, code execution, retrieval, analytics, and integrations — PandaFlow gives advanced builders room to grow."
            />
            <div className="mt-14 space-y-4">
              <MarqueeRow items={nodeRowOne} direction="left" />
              <MarqueeRow items={nodeRowTwo} direction="right" />
            </div>
          </div>
        </section>

        <section id="templates" className="px-6 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Template gallery"
              title="Start from a template. Ship in minutes."
              description="Browse real templates from the PandaFlow library, reuse proven node graphs, and adapt them to your own stack."
            />

            <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {homeTemplates.map((template) => {
                const Icon = getTemplateIcon(template.icon);
                const gradient = `linear-gradient(135deg, ${template.color}22 0%, transparent 70%)`;
                const nodeLabels = getTemplateNodes(template).slice(0, 4).map((node) => getTemplateNodeLabel(node));

                return (
                  <Card key={template.id} className="group overflow-hidden border border-zinc-800 bg-zinc-900 shadow-sm transition hover:border-indigo-500/30 hover:shadow-[0_20px_80px_rgba(79,70,229,0.12)]">
                    <CardContent className="p-0">
                      <div className="border-b border-white/10 p-6" style={{ background: gradient }}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-white/10 bg-zinc-950/80 p-3 shadow-sm">
                              <Icon className="h-5 w-5" style={{ color: template.color }} />
                            </div>
                            <Badge className={cn('rounded-full border text-xs font-medium', categoryBadgeClasses[template.category] ?? 'border-white/10 bg-white/5 text-zinc-200')}>
                              {template.category}
                            </Badge>
                          </div>
                          <Badge className={cn('capitalize', difficultyClasses[template.difficulty])}>{template.difficulty}</Badge>
                        </div>
                        <h3 className="text-2xl font-semibold text-white">{template.name}</h3>
                        <p className="mt-3 line-clamp-2 text-sm leading-7 text-zinc-400">{template.description}</p>
                      </div>

                      <div className="space-y-4 p-6">
                        <TemplateMiniPreview template={template} />
                        <div className="flex flex-wrap gap-2">
                          {nodeLabels.map((label) => (
                            <span
                              key={`${template.id}-${label}`}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-zinc-500">{template.estimatedTime}</div>
                          <Link href="/templates" className="inline-flex items-center gap-2 text-sm font-medium text-white transition hover:text-indigo-300">
                            View Template
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="open-source" className="relative isolate px-6 py-24 lg:px-8">
          <div className="absolute inset-0 marketing-grid opacity-20" />
          <div className="absolute left-20 top-12 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl" />
          <div className="relative mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Open source + cloud"
              title="Built in public. Owned by the community."
              description="PandaFlow is MIT licensed. Self-host it on your own infrastructure, fork it, and extend it. No vendor lock-in."
            />

            <div className="mt-16 grid gap-6 lg:grid-cols-2">
              <div className="rounded-[32px] border border-white/10 bg-zinc-900/90 p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-zinc-100">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-2xl font-semibold text-white">Self-host</h3>
                <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
                  Run PandaFlow on your infrastructure with full control over data, networking, secrets, and runtime policy.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                    <Link href={licenseUrl}>MIT License</Link>
                  </Button>
                  <Button asChild variant="ghost" className="text-zinc-300 hover:text-white">
                    <Link href={contributingUrl}>Contributing</Link>
                  </Button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[32px] border border-indigo-500/20 bg-gradient-to-br from-indigo-600/20 via-zinc-900 to-zinc-900 p-8 shadow-[0_24px_120px_rgba(79,70,229,0.18)]">
                <div className="absolute right-6 top-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Coming Soon
                  </span>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-100">
                  <Cloud className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-2xl font-semibold text-white">Cloud</h3>
                <p className="mt-3 max-w-md text-sm leading-7 text-zinc-300">
                  We run it for you. Enterprise isolation via Sandflare microVMs, automatic scaling, and a managed control plane. Hosted by PandastackIO Inc.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button disabled className="cursor-not-allowed bg-indigo-600/50 text-white/60">
                    <Cloud className="h-4 w-4" />
                    Cloud Waitlist — Coming Soon
                  </Button>
                </div>
                <p className="mt-4 text-xs text-zinc-500">Self-host today · Cloud managed version in progress</p>
              </div>
            </div>

            <div className="mt-12 rounded-[32px] border border-white/10 bg-zinc-900/80 p-8 text-center">
              <div className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">OR CONTRIBUTE</div>
              <div className="mt-5 flex justify-center text-indigo-300">
                <GitPullRequest className="h-8 w-8" />
              </div>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-300">
                Want to add nodes, fix bugs, or improve docs? PandaFlow welcomes contributions.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild className="bg-white text-black hover:bg-zinc-200">
                  <Link href={githubUrl} target="_blank" rel="noreferrer">
                    View on GitHub
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                  <Link href={contributingUrl}>
                    Read Contributing Guide
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-zinc-950 px-6 py-12 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 text-lg tracking-tight text-white">
              <img src="/pandaflow-logo.png" alt="PandaFlow" className="h-7 w-7" />
              <span className="font-bold">PandaFlow</span>
            </div>
            <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">Open source AI agent workflow builder by PandastackIO Inc.</p>
            <div className="mt-4 text-sm text-emerald-400">Built with ❤️ from PandastackIO Inc.</div>
          </div>

          <div className="grid gap-8 text-sm text-zinc-400 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="mb-3 font-medium text-white">Project</div>
              <div className="space-y-2">
                <Link href={githubUrl} target="_blank" rel="noreferrer" className="block transition hover:text-white">
                  GitHub
                </Link>
                <Link href={licenseUrl} className="block transition hover:text-white">
                  MIT License
                </Link>
                <Link href={contributingUrl} className="block transition hover:text-white">
                  Contributing
                </Link>
              </div>
            </div>
            <div>
              <div className="mb-3 font-medium text-white">Product</div>
              <div className="space-y-2">
                <a href="#features" className="block transition hover:text-white">
                  Features
                </a>
                <a href="#nodes" className="block transition hover:text-white">
                  Nodes
                </a>
                <a href="#templates" className="block transition hover:text-white">
                  Templates
                </a>
              </div>
            </div>
            <div>
              <div className="mb-3 font-medium text-white">Company</div>
              <div className="space-y-2 text-zinc-500">
                <div>PandastackIO Inc.</div>
                <a href="https://pandastack.io" className="hover:text-white transition">pandastack.io</a>
                <div>© 2025 PandastackIO Inc. PandaFlow is open source under the MIT License.</div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
