'use client';

import { Bot, Database, Globe, MessageSquare, TerminalSquare, Webhook, Zap } from 'lucide-react';
import type { ReactNode } from 'react';

/* ── Node card ─────────────────────────────────────────────── */

interface NodeCardProps {
  icon: ReactNode;
  label: string;
  sub: string;
  highlight?: boolean;
  delay?: number;
  x: number;
  y: number;
  w?: number;
}

const NODE_H = 52;
const NODE_W = 155;
const ICON_S = 'h-3.5 w-3.5 text-zinc-400';

function NodeCard({ icon, label, sub, highlight, delay = 0, x, y, w = NODE_W }: NodeCardProps) {
  return (
    <foreignObject x={x} y={y} width={w} height={NODE_H} overflow="visible">
      <div
        // @ts-expect-error -- xmlns needed for foreignObject
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          animationDelay: `${delay}ms`,
          animationFillMode: 'both',
          width: w,
          height: NODE_H,
        }}
        className={[
          'node-enter flex items-center gap-2.5 rounded-xl px-3 py-2.5 border bg-zinc-950 text-white shadow-xl',
          highlight ? 'border-white/25' : 'border-white/[0.08]',
        ].join(' ')}
      >
        <div className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
          highlight ? 'border-white/25 bg-white/10' : 'border-white/[0.08] bg-white/[0.04]',
        ].join(' ')}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-zinc-100 leading-tight">{label}</p>
          <p className="truncate text-[9.5px] text-zinc-500 leading-tight mt-0.5">{sub}</p>
        </div>
      </div>
    </foreignObject>
  );
}

/* ── Edge ──────────────────────────────────────────────────── */

function Edge({ x1, y1, x2, y2, delay = 0 }: { x1: number; y1: number; x2: number; y2: number; delay?: number }) {
  const mx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.3;
  return (
    <path
      d={d}
      fill="none"
      stroke="rgba(255,255,255,0.15)"
      strokeWidth="1.5"
      strokeDasharray={`${len} ${len}`}
      strokeDashoffset={len}
      style={{
        animation: `drawEdge 0.6s ease forwards`,
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

/* ── Dot ────────────────────────────────────────────────────── */

function HandleDot({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={4} fill="#18181b" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />;
}

/* ── Main component ────────────────────────────────────────── */

// Layout constants
const C1 = 0;     // col 1 x
const C2 = 200;   // col 2 x
const C3 = 400;   // col 3 x
const C4 = 600;   // col 4 x
const C5 = 800;   // col 5 x
const R1 = 0;     // row 1 y
const R2 = 100;   // row 2 y
const R3 = 200;   // row 3 y
const W  = NODE_W;
const MH = NODE_H / 2; // mid-height of node

// Right edge of a node: x + W
// Left edge: x
// Mid-right: (x + W, y + MH)
// Mid-left:  (x,     y + MH)

export default function HeroFlow({ className }: { className?: string }) {
  // Viewbox: nodes go from x=0 to x=800+155=955, y=0 to y=200+52=252
  // Add padding: 16 each side → viewBox="-16 -16 987 284"
  const VB = '-16 -16 987 284';

  return (
    <>
      <style>{`
        @keyframes nodeIn {
          from { opacity: 0; transform: translateY(6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes drawEdge {
          to { stroke-dashoffset: 0; }
        }
        .node-enter { animation: nodeIn 0.5s cubic-bezier(0.16,1,0.3,1); }
      `}</style>
      <div className={className} style={{ background: '#050505' }}>
        <svg
          viewBox={VB}
          className="h-full w-full"
          style={{ overflow: 'visible' }}
        >
          {/* ── Edges ── */}
          {/* Webhook → Scrape URL */}
          <Edge x1={C1+W} y1={R2+MH} x2={C2}   y2={R1+MH} delay={400} />
          {/* Webhook → GPT-4o */}
          <Edge x1={C1+W} y1={R2+MH} x2={C2}   y2={R3+MH} delay={500} />
          {/* Scrape URL → Python */}
          <Edge x1={C2+W} y1={R1+MH} x2={C3}   y2={R2+MH} delay={600} />
          {/* GPT-4o → Python */}
          <Edge x1={C2+W} y1={R3+MH} x2={C3}   y2={R2+MH} delay={700} />
          {/* Python → Postgres */}
          <Edge x1={C3+W} y1={R2+MH} x2={C4}   y2={R1+MH} delay={800} />
          {/* Python → Slack */}
          <Edge x1={C3+W} y1={R2+MH} x2={C4}   y2={R3+MH} delay={900} />
          {/* Postgres → Done */}
          <Edge x1={C4+W} y1={R1+MH} x2={C5}   y2={R2+MH} delay={1000} />
          {/* Slack → Done */}
          <Edge x1={C4+W} y1={R3+MH} x2={C5}   y2={R2+MH} delay={1100} />

          {/* ── Handle dots ── */}
          <HandleDot cx={C1+W} cy={R2+MH} />
          <HandleDot cx={C2}   cy={R1+MH} />
          <HandleDot cx={C2}   cy={R3+MH} />
          <HandleDot cx={C2+W} cy={R1+MH} />
          <HandleDot cx={C2+W} cy={R3+MH} />
          <HandleDot cx={C3}   cy={R2+MH} />
          <HandleDot cx={C3+W} cy={R2+MH} />
          <HandleDot cx={C4}   cy={R1+MH} />
          <HandleDot cx={C4}   cy={R3+MH} />
          <HandleDot cx={C4+W} cy={R1+MH} />
          <HandleDot cx={C4+W} cy={R3+MH} />
          <HandleDot cx={C5}   cy={R2+MH} />

          {/* ── Nodes ── */}
          <NodeCard x={C1} y={R2} label="Webhook"    sub="trigger.manual"   icon={<Webhook        className={ICON_S} />} highlight delay={0}   />
          <NodeCard x={C2} y={R1} label="Scrape URL" sub="web.scraper"       icon={<Globe          className={ICON_S} />}           delay={150} />
          <NodeCard x={C2} y={R3} label="GPT-4o"     sub="ai.llm"            icon={<Bot            className={ICON_S} />} highlight delay={200} />
          <NodeCard x={C3} y={R2} label="Python"     sub="sandflare.python"  icon={<TerminalSquare className={ICON_S} />}           delay={350} />
          <NodeCard x={C4} y={R1} label="Postgres"   sub="db.postgres"       icon={<Database       className={ICON_S} />}           delay={500} />
          <NodeCard x={C4} y={R3} label="Slack"      sub="notify.slack"      icon={<MessageSquare  className={ICON_S} />} highlight delay={500} />
          <NodeCard x={C5} y={R2} label="Done"       sub="trigger.output"    icon={<Zap            className={ICON_S} />}           delay={650} />
        </svg>
      </div>
    </>
  );
}
