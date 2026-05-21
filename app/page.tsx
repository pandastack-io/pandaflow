'use client';

import HeroFlow from '@/components/marketing/HeroFlow';
import { useRef, useEffect, type ReactNode } from 'react';
import { motion, useInView, animate, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';

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

const Github = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" className={className} aria-hidden="true" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const githubUrl = 'https://github.com/pandastack-io/pandaflow';
const contributingUrl = 'https://github.com/pandastack-io/pandaflow/blob/main/CONTRIBUTING.md';
const licenseUrl = 'https://github.com/pandastack-io/pandaflow/blob/main/LICENSE';

const stats = [
  { value: '165+', label: 'Node Types' },
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
    title: 'Multi-agent orchestration',
    description: 'Compose agents that call other agents. A Supervisor plans the work, fans out to workers in parallel, and aggregates results — all with distributed tracing and circuit breakers.',
    icon: GitBranch,
  },
  {
    title: 'Durable execution',
    description: 'Every step is checkpointed to the database before and after it runs. If the process crashes, re-running the workflow replays completed steps instantly from cache.',
    icon: RefreshCcw,
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


/* ─── Reusable motion primitives ──────────────────────────── */

function FadeUp({
  children,
  delay = 0,
  className,
  spotlight = false,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  spotlight?: boolean;
}) {
  const sX = useMotionValue(0);
  const sY = useMotionValue(0);
  const spotBg = useMotionTemplate`radial-gradient(260px at ${sX}px ${sY}px, rgba(255,255,255,0.05), transparent 80%)`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-6%' }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('relative', className)}
      onMouseMove={spotlight ? (e: React.MouseEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        sX.set(e.clientX - r.left);
        sY.set(e.clientY - r.top);
      } : undefined}
    >
      {spotlight && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
          style={{ background: spotBg }}
        />
      )}
      {children}
    </motion.div>
  );
}

/* ─── Magnetic button wrapper ───────────────────────────────── */
function MagneticButton({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 18 });
  const springY = useSpring(y, { stiffness: 260, damping: 18 });
  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY, display: 'inline-flex' }}
      onMouseMove={(e) => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.32);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.32);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const ctrl = animate(0, to, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) ref.current.textContent = String(Math.round(v)) + suffix;
      },
    });
    return () => ctrl.stop();
  }, [inView, to, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}


/* ─── Animated beam connecting "How it works" steps ─────── */
function BeamConnector() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15%' });
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-[16.67%] right-[16.67%] hidden overflow-visible md:block"
      style={{ top: '38px', height: '2px' }}
    >
      {/* beam line */}
      <motion.div
        className="absolute inset-0 origin-left"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.18), transparent)',
          scaleX: inView ? 1 : 0,
        }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* travelling particle */}
      {inView && (
        <motion.div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white"
          style={{ boxShadow: '0 0 10px 3px rgba(255,255,255,0.5)' }}
          animate={{ left: ['0%', '100%'] }}
          transition={{
            duration: 1.6,
            ease: 'easeInOut',
            delay: 0.4,
            repeat: Infinity,
            repeatDelay: 2.5,
          }}
        />
      )}
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────── */

export default function HomePage() {
  /* Mouse-tracking spotlight for hero */
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const spotBg = useMotionTemplate`radial-gradient(500px at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.04), transparent 70%)`;

  return (
    <div className="min-h-screen bg-[#000] text-white selection:bg-white/20">

      {/* ── Announcement bar ────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[11px] text-zinc-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/30" />
        PandaFlow Cloud is coming — managed by PandastackIO&nbsp;Inc.
        <a href="#open-source" className="ml-1 text-zinc-300 underline underline-offset-2 transition hover:text-white">
          Learn more →
        </a>
      </div>

      {/* ── Nav ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#000]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/pandaflow-logo.png" alt="PandaFlow" className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">PandaFlow</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Nodes', href: '#nodes' },
              { label: 'Templates', href: '#templates' },
              { label: 'Open Source', href: '#open-source' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-[13px] text-zinc-500 transition hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3.5 py-1.5 text-[12px] text-zinc-400 transition hover:border-white/25 hover:text-white"
            >
              <Github className="h-3.5 w-3.5" />
              Star on GitHub
            </a>
            <Link
              href="/sign-up"
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-zinc-100"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>

        {/* ════════════════════════════════════════════════════
            HERO — split layout with 3D workflow graph
        ════════════════════════════════════════════════════ */}
        <section
          className="relative overflow-hidden border-b border-white/[0.06]"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            mouseX.set(e.clientX - rect.left);
            mouseY.set(e.clientY - rect.top);
          }}
        >
          {/* dot grid */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)',
            }}
          />
          {/* mouse-tracking spotlight */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ background: spotBg }}
          />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 py-20 lg:grid-cols-2 lg:gap-0 lg:px-8 lg:py-0 lg:min-h-[calc(100vh-105px)]">

            {/* Left ── text */}
            <div className="flex flex-col lg:py-24">
              <FadeUp>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-[12px] text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
                >
                  <Github className="h-3.5 w-3.5" />
                  <span>Open source · MIT License</span>
                  <span className="ml-1 text-zinc-600">·</span>
                  <span className="flex items-center gap-1 text-zinc-300">
                    Star on GitHub
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>
              </FadeUp>

              <FadeUp delay={0.06}>
                <h1 className="text-[52px] font-bold leading-[1.04] tracking-[-0.03em] text-white sm:text-[64px] lg:text-[70px]">
                  Build AI agents.<br />
                  Drag.&nbsp;Connect.<br />
                  <span className="text-zinc-500">Ship.</span>
                </h1>
              </FadeUp>

              <FadeUp delay={0.12}>
                <p className="mt-6 max-w-md text-[15px] leading-7 text-zinc-400">
                  Compose multi-agent systems with a drag-and-drop canvas. 165+ prebuilt nodes,
                  durable Temporal execution, and per-run Sandflare microVM isolation.
                </p>
              </FadeUp>

              <FadeUp delay={0.16}>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-600">
                  {['Self-hostable', '165+ nodes', 'MIT licensed', 'No vendor lock-in'].map((t, i) => (
                    <span key={t} className="flex items-center gap-3">
                      {t}
                      {i < 3 && <span>·</span>}
                    </span>
                  ))}
                </div>
              </FadeUp>

              <FadeUp delay={0.2}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <MagneticButton>
                    <Link
                      href="/sign-up"
                      className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-semibold text-black transition hover:bg-zinc-100"
                    >
                      Start building free <ArrowRight className="h-4 w-4" />
                    </Link>
                  </MagneticButton>
                  <MagneticButton>
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-[13px] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <Github className="h-4 w-4" />
                      View on GitHub
                    </a>
                  </MagneticButton>
                </div>
              </FadeUp>

              {/* Integrations strip */}
              <FadeUp delay={0.26}>
                <div className="mt-10 border-t border-white/[0.06] pt-8">
                  <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-700">
                    Powers workflows alongside
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    {([
                      [SiOpenai, 'OpenAI'],
                      [SiAnthropic, 'Anthropic'],
                      [SiPostgresql, 'Postgres'],
                      [SiRedis, 'Redis'],
                      [SiPython, 'Python'],
                      [SiSlack, 'Slack'],
                      [SiGithub, 'GitHub'],
                    ] as const).map(([Icon, name]) => (
                      <div
                        key={name}
                        title={name}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-500 transition hover:border-white/15 hover:text-zinc-300"
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    ))}
                  </div>
                </div>
              </FadeUp>
            </div>

            {/* Right ── 3D scene */}
            <FadeUp delay={0.1} className="relative lg:h-full lg:flex lg:items-center">
              <div className="relative w-full">
                {/* Glow behind the 3D canvas */}
                <div className="absolute -inset-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(255,255,255,0.04),transparent)] pointer-events-none" />
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_40px_100px_rgba(0,0,0,0.9)]">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.15]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.15]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.15]" />
                    <div className="ml-3 flex-1 rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-zinc-600">
                      pandaflow.xyz / workflows / competitor-intel
                    </div>
                  </div>
                  <HeroFlow className="h-[420px] lg:h-[480px]" />
                </div>
              </div>
            </FadeUp>

          </div>
        </section>

        {/* ── Stats bar ─────────────────────────────────── */}
        <div className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-4xl">
            <div className="grid grid-cols-2 divide-x divide-white/[0.06] sm:grid-cols-4">
              {([
                { label: 'Node Types', to: 165, suffix: '+' },
                { label: 'Templates', to: 130, suffix: '+' },
                { label: 'License', value: 'MIT' },
                { label: 'Open Source', value: '100%' },
              ] as Array<{ label: string; to?: number; suffix?: string; value?: string }>).map((s) => (
                <div key={s.label} className="px-8 py-8 text-center">
                  <div className="text-2xl font-bold text-white tabular-nums">
                    {s.to !== undefined ? <Counter to={s.to} suffix={s.suffix} /> : s.value}
                  </div>
                  <div className="mt-1 text-[12px] text-zinc-600">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            BENTO FEATURES
        ════════════════════════════════════════════════════ */}
        <section id="features" className="px-6 py-28 lg:px-8">
          <div className="mx-auto max-w-7xl">

            <FadeUp className="mb-14">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                Capabilities
              </p>
              <h2 className="text-5xl font-bold tracking-[-0.03em] text-white sm:text-6xl">
                Everything in one canvas.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-7 text-zinc-500">
                From trigger to output — every piece of your agent pipeline lives in a single visual graph.
              </p>
            </FadeUp>

            {/* 3-col × 4-row bento */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-4">

              {/* ── 1 · Visual Builder  col-span-2 row-span-2 ── */}
              <FadeUp
                delay={0.04}
                spotlight
                className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] md:col-span-2 md:row-span-2 hover:border-white/[0.13] transition-colors group"
              >
                <div className="p-8">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                    <Workflow className="h-4.5 w-4.5 text-zinc-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Visual canvas builder</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-500">
                    Drag nodes, draw edges, wire multi-step pipelines inline. No YAML, no boilerplate.
                  </p>
                </div>
                <div className="h-52 overflow-hidden border-t border-white/[0.06] transition-transform duration-700 group-hover:scale-[1.01]">
                  <HeroFlow className="h-full w-full" />
                </div>
              </FadeUp>

              {/* ── 2 · 165+ Nodes  col-start-3 row-start-1 ── */}
              <FadeUp
                delay={0.08}
                spotlight
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 md:col-start-3 md:row-start-1 hover:border-white/[0.13] transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                  <Layers className="h-4 w-4 text-zinc-300" />
                </div>
                <div className="text-6xl font-bold tabular-nums text-white">
                  <Counter to={165} suffix="+" />
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">Prebuilt nodes</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-zinc-500">
                  LLMs, databases, code runtimes, vector search, APIs — all prebuilt.
                </p>
              </FadeUp>

              {/* ── 3 · microVM Isolation  col-start-3 row-start-2 ── */}
              <FadeUp
                delay={0.12}
                spotlight
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 md:col-start-3 md:row-start-2 hover:border-white/[0.13] transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                  <ShieldCheck className="h-4 w-4 text-zinc-300" />
                </div>
                <h3 className="text-sm font-semibold text-white">microVM isolation</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Each run gets its own Sandflare microVM. Clean state, wiped on exit.
                </p>
                <div className="mt-5 space-y-2">
                  {['microVM booted', 'secrets mounted', 'memory wiped'].map((s) => (
                    <div key={s} className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                      <span className="text-zinc-700">$</span> {s}
                    </div>
                  ))}
                </div>
              </FadeUp>

              {/* ── 4 · Multi-agent  col-start-1 row-start-3 ── */}
              <FadeUp
                delay={0.16}
                spotlight
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 md:col-start-1 md:row-start-3 hover:border-white/[0.13] transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                  <GitBranch className="h-4 w-4 text-zinc-300" />
                </div>
                <h3 className="text-sm font-semibold text-white">Multi-agent orchestration</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Supervisors fan out to parallel workers, aggregate results, handle failures — all on the canvas.
                </p>
                {/* Fork diagram SVG */}
                <svg viewBox="0 0 110 64" className="mt-5 w-full opacity-35" fill="none">
                  <circle cx="10" cy="32" r="5" fill="#fff" />
                  <line x1="15" y1="32" x2="38" y2="12" stroke="#fff" strokeWidth="1" />
                  <line x1="15" y1="32" x2="38" y2="32" stroke="#fff" strokeWidth="1" />
                  <line x1="15" y1="32" x2="38" y2="52" stroke="#fff" strokeWidth="1" />
                  <circle cx="43" cy="12" r="4" fill="#fff" />
                  <circle cx="43" cy="32" r="4" fill="#fff" />
                  <circle cx="43" cy="52" r="4" fill="#fff" />
                  <line x1="47" y1="12" x2="63" y2="32" stroke="#fff" strokeWidth="1" />
                  <line x1="47" y1="32" x2="63" y2="32" stroke="#fff" strokeWidth="1" />
                  <line x1="47" y1="52" x2="63" y2="32" stroke="#fff" strokeWidth="1" />
                  <circle cx="68" cy="32" r="5" fill="#fff" />
                </svg>
              </FadeUp>

              {/* ── 5 · Open Source  col-span-2 col-start-2 row-start-3 ── */}
              <FadeUp
                delay={0.2}
                spotlight
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 md:col-span-2 md:col-start-2 md:row-start-3 hover:border-white/[0.13] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                        <Github className="h-4 w-4 text-zinc-300" />
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                        MIT Licensed
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">Open source. No vendor lock-in.</h3>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                      Fork it, extend it, self-host it. Every line of code is on GitHub.
                    </p>
                  </div>
                </div>
                <code className="mt-5 block rounded-xl border border-white/[0.07] bg-black/70 px-4 py-3.5 font-mono text-[12px] text-zinc-400">
                  git clone https://github.com/pandastack-io/pandaflow.git
                </code>
              </FadeUp>

              {/* ── 6 · Durable Execution  col-span-2 row-start-4 ── */}
              <FadeUp
                delay={0.24}
                spotlight
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 md:col-span-2 md:row-start-4 hover:border-white/[0.13] transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                  <RefreshCcw className="h-4 w-4 text-zinc-300" />
                </div>
                <h3 className="text-sm font-semibold text-white">Durable execution via Temporal</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Steps checkpointed before and after. Crashes replay from last known good state. No lost work, ever.
                </p>
                {/* Timeline visualization */}
                <div className="mt-6 flex items-center gap-0">
                  {[
                    { label: 'Trigger', done: true },
                    { label: 'LLM', done: true },
                    { label: 'Python', done: true },
                    { label: 'DB write', done: false, current: true },
                    { label: 'Notify', done: false },
                  ].map((step, i) => (
                    <div key={step.label} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'h-2.5 w-2.5 rounded-full border',
                            step.current
                              ? 'border-white bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]'
                              : step.done
                              ? 'border-white/40 bg-white/40'
                              : 'border-white/15 bg-transparent'
                          )}
                        />
                        <span className="mt-2 text-[10px] text-zinc-600 whitespace-nowrap">{step.label}</span>
                      </div>
                      {i < 4 && (
                        <div className={cn('mx-1.5 h-px w-10 sm:w-16', step.done ? 'bg-white/25' : 'bg-white/08')} />
                      )}
                    </div>
                  ))}
                </div>
              </FadeUp>

              {/* ── 7 · Real-time Monitoring  col-start-3 row-start-4 ── */}
              <FadeUp
                delay={0.28}
                spotlight
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 md:col-start-3 md:row-start-4 hover:border-white/[0.13] transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                  <Zap className="h-4 w-4 text-zinc-300" />
                </div>
                <h3 className="text-sm font-semibold text-white">Real-time monitoring</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Watch each node execute, fail, or retry live via Server-Sent Events.
                </p>
                {/* Pulse bars */}
                <div className="mt-5 flex items-end gap-1.5 h-12">
                  {[3, 5, 2, 7, 4, 6, 3, 8, 5, 4, 9, 6].map((h, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-sm bg-white/20"
                      animate={{ height: [`${h * 5}px`, `${(h + 2) * 5}px`, `${h * 5}px`] }}
                      transition={{ duration: 1.2 + i * 0.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                    />
                  ))}
                </div>
              </FadeUp>

            </div>
          </div>
        </section>

        {/* ── How it works ────────────────────────────────── */}
        <section className="border-t border-white/[0.06] px-6 py-28 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <FadeUp className="mb-16 text-center">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">How it works</p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
                From idea to deployed agent<br />in three steps.
              </h2>
            </FadeUp>

            <div className="relative grid gap-6 md:grid-cols-3">
              {/* animated beam + travelling particle */}
              <BeamConnector />

              {[
                {
                  n: '01',
                  icon: Workflow,
                  title: 'Design on canvas',
                  body: 'Drag 165+ nodes onto the canvas. Connect them with edges. Configure each node inline — no code required.',
                },
                {
                  n: '02',
                  icon: Cpu,
                  title: 'Run with isolation',
                  body: 'Hit play. Each execution spawns a fresh Sandflare microVM. Secrets mounted, code runs, VM wiped on exit.',
                },
                {
                  n: '03',
                  icon: Zap,
                  title: 'Monitor & iterate',
                  body: 'Watch execution progress in real time. Each step is checkpointed. Failures replay from where they left off.',
                },
              ].map(({ n, icon: Icon, title, body }, i) => (
                <FadeUp key={n} delay={i * 0.1}>
                  <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:border-white/[0.13] transition-colors">
                    <span className="mb-5 block font-mono text-[11px] text-zinc-700">{n}</span>
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                      <Icon className="h-4.5 w-4.5 text-zinc-300" />
                    </div>
                    <h3 className="text-base font-semibold text-white">{title}</h3>
                    <p className="mt-2.5 text-[13px] leading-7 text-zinc-500">{body}</p>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            NODES MARQUEE
        ════════════════════════════════════════════════════ */}
        <section id="nodes" className="border-t border-white/[0.06] bg-white/[0.01] py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <FadeUp className="mb-12 text-center">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Node library</p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-white">160+ nodes. Serious depth.</h2>
              <p className="mx-auto mt-3 max-w-lg text-[15px] text-zinc-500">
                LLMs, databases, code runtimes, webhooks, transformations, integrations — all prebuilt.
              </p>
            </FadeUp>
            <div className="space-y-3">
              <MarqueeRow items={nodeRowOne} direction="left" />
              <MarqueeRow items={nodeRowTwo} direction="right" />
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            ISOLATION — terminal section
        ════════════════════════════════════════════════════ */}
        <section className="relative border-t border-white/[0.06] px-6 py-28 lg:px-8">
          <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

          <div className="relative mx-auto max-w-7xl">
            <FadeUp className="mb-14">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Sandflare isolation</p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
                Every execution<br />starts clean.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-7 text-zinc-500">
                Each workflow run gets a dedicated microVM. Secrets, memory, packages, and code are fully isolated from every other run.
              </p>
            </FadeUp>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Terminal */}
              <FadeUp delay={0.06}>
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080808]">
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
                    <span className="ml-3 font-mono text-[11px] text-zinc-700">pandaflow ~ sandbox</span>
                  </div>
                  <div className="space-y-1.5 px-6 py-7 font-mono text-[13px] leading-7">
                    <div className="text-zinc-700"># Invoke a deployed workflow via API</div>
                    <div className="text-zinc-300">{'$ curl -X POST https://your-host/api/agents/invoke \\'}</div>
                    <div className="pl-4 text-zinc-400">{'-H "Authorization: Bearer agt_••••••••" \\'}</div>
                    <div className="pl-4 text-zinc-500">{"-d '{\"input\": {\"query\": \"analyze repo\"}}'"}  </div>
                    <div className="mt-4 text-zinc-700"># Runtime handles isolation</div>
                    <div className="text-zinc-400">[✓] Identity verified</div>
                    <div className="text-zinc-400">[✓] Spawning microVM...</div>
                    <div className="text-zinc-400">[✓] Secrets mounted (read-only)</div>
                    <div className="text-zinc-300">[✓] Workflow executing...</div>
                    <div className="text-white font-medium">[✓] microVM terminated — memory wiped</div>
                  </div>
                </div>
              </FadeUp>

              {/* Bullets */}
              <div className="grid gap-3">
                {isolationBullets.map((b, i) => (
                  <FadeUp key={b.title} delay={0.08 + i * 0.06}>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-white/[0.13] transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                          <b.icon className="h-4 w-4 text-zinc-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{b.title}</h3>
                          <p className="mt-1 text-[13px] leading-6 text-zinc-500">{b.description}</p>
                        </div>
                      </div>
                    </div>
                  </FadeUp>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            TEMPLATES
        ════════════════════════════════════════════════════ */}
        <section id="templates" className="border-t border-white/[0.06] px-6 py-28 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FadeUp className="mb-14 text-center">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Template gallery</p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-white">Start fast. Adapt quickly.</h2>
              <p className="mx-auto mt-3 max-w-lg text-[15px] text-zinc-500">
                Browse real templates from the PandaFlow library. Reuse proven node graphs and adapt them to your stack.
              </p>
            </FadeUp>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {homeTemplates.map((template, i) => {
                const Icon = getTemplateIcon(template.icon);
                const nodeLabels = getTemplateNodes(template).slice(0, 4).map((node) => getTemplateNodeLabel(node));
                return (
                  <FadeUp key={template.id} delay={i * 0.06}>
                    <div className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] transition-colors h-full">
                      <div className="border-b border-white/[0.07] p-6">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-white/[0.1] bg-white/[0.06] p-2.5">
                              <Icon className="h-4 w-4 text-zinc-300" />
                            </div>
                            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                              {template.category}
                            </span>
                          </div>
                          <span className="text-[11px] capitalize text-zinc-600">{template.difficulty}</span>
                        </div>
                        <h3 className="text-base font-semibold text-white">{template.name}</h3>
                        <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-zinc-500">{template.description}</p>
                      </div>
                      <div className="space-y-4 p-6">
                        <TemplateMiniPreview template={template} />
                        <div className="flex flex-wrap gap-2">
                          {nodeLabels.map((label) => (
                            <span
                              key={`${template.id}-${label}`}
                              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-500"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-600">{template.estimatedTime}</span>
                          <Link
                            href="/templates"
                            className="flex items-center gap-1 text-[12px] font-medium text-zinc-300 transition hover:text-white"
                          >
                            Use template <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </FadeUp>
                );
              })}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            OPEN SOURCE
        ════════════════════════════════════════════════════ */}
        <section id="open-source" className="border-t border-white/[0.06] px-6 py-28 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FadeUp className="mb-14">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                Open source + cloud
              </p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
                Built in public.<br />Owned by the community.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-7 text-zinc-500">
                MIT licensed. Self-host it, fork it, extend it. No vendor lock-in, ever.
              </p>
            </FadeUp>

            <div className="grid gap-4 lg:grid-cols-2">
              <FadeUp delay={0.06}>
                <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:border-white/[0.13] transition-colors">
                  <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                    <Lock className="h-4 w-4 text-zinc-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Self-host</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-500">
                    Run PandaFlow on your own infrastructure. Full control over data, networking, secrets, and runtime policy.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href={licenseUrl}
                      className="flex items-center rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      MIT License
                    </a>
                    <a
                      href={contributingUrl}
                      className="flex items-center rounded-full px-4 py-2 text-[13px] text-zinc-500 transition hover:text-white"
                    >
                      Contributing →
                    </a>
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={0.1}>
                <div className="relative h-full overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.03] p-8 hover:border-white/[0.16] transition-colors">
                  <div className="absolute right-5 top-5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
                      Coming Soon
                    </span>
                  </div>
                  <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                    <Cloud className="h-4 w-4 text-zinc-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Cloud</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    We run it for you. Enterprise isolation via Sandflare microVMs, automatic scaling, and a managed control plane by PandastackIO Inc.
                  </p>
                  <p className="mt-6 text-[12px] text-zinc-600">Self-host today · Cloud managed version in progress</p>
                </div>
              </FadeUp>
            </div>

            <FadeUp delay={0.14}>
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-10 text-center hover:border-white/[0.13] transition-colors">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                  <GitPullRequest className="h-4 w-4 text-zinc-300" />
                </div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Contribute</p>
                <p className="mx-auto max-w-md text-sm leading-7 text-zinc-400">
                  Add nodes, fix bugs, improve docs. PandaFlow welcomes contributions from the community.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-semibold text-black transition hover:bg-zinc-100"
                  >
                    View on GitHub <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href={contributingUrl}
                    className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-[13px] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    Contributing guide
                  </a>
                </div>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════════════ */}
        <section className="px-6 pb-28 lg:px-8">
          <FadeUp>
            <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-white/[0.1] px-10 py-24 text-center">
              {/* dot grid bg */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(255,255,255,0.06),transparent)]" />
              <div className="relative">
                <h2 className="text-5xl font-bold tracking-[-0.03em] text-white sm:text-6xl">
                  Ready to build?
                </h2>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-zinc-500">
                  Start with a template or build from scratch. Free to self-host. Open source forever.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[14px] font-semibold text-black transition hover:bg-zinc-100"
                  >
                    Start building free <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-8 py-4 text-[14px] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    <Github className="h-4 w-4" />
                    Star on GitHub
                  </a>
                </div>
              </div>
            </div>
          </FadeUp>
        </section>

      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-6 py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <img src="/pandaflow-logo.png" alt="PandaFlow" className="h-7 w-7" />
                <span className="text-sm font-semibold text-white">PandaFlow</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-600">
                Open source AI agent workflow builder by PandastackIO Inc.
              </p>
              <p className="mt-3 text-xs text-zinc-700">Built with ❤️ by PandastackIO Inc.</p>
            </div>

            <div className="grid gap-10 text-sm sm:grid-cols-3">
              {[
                {
                  heading: 'Community',
                  links: [
                    { label: 'Discord', href: 'https://discord.gg/umvVSQgh', external: true },
                    { label: 'GitHub', href: githubUrl, external: true },
                    { label: 'Contributing', href: contributingUrl, external: true },
                  ],
                },
                {
                  heading: 'Project',
                  links: [
                    { label: 'MIT License', href: licenseUrl },
                  ],
                },
                {
                  heading: 'Product',
                  links: [
                    { label: 'Features', href: '#features' },
                    { label: 'Nodes', href: '#nodes' },
                    { label: 'Templates', href: '#templates' },
                  ],
                },
                {
                  heading: 'Company',
                  links: [
                    { label: 'PandastackIO Inc.', href: '#' },
                    { label: 'pandastack.io', href: 'https://pandastack.io', external: true },
                  ],
                },
              ].map(({ heading, links }) => (
                <div key={heading}>
                  <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
                    {heading}
                  </p>
                  <ul className="space-y-3">
                    {links.map(({ label, href, external }) => (
                      <li key={label}>
                        <Link
                          href={href}
                          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                          className="text-[13px] text-zinc-500 transition hover:text-white"
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 border-t border-white/[0.06] pt-6 text-[12px] text-zinc-700">
            © 2025 PandastackIO Inc. PandaFlow is open source under the MIT License.
          </div>
        </div>
      </footer>

    </div>
  );
}
