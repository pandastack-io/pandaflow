'use client';

import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow';

type CustomEdgeData = {
  label?: string;
  durationMs?: number;
  heatmapActive?: boolean;
};

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number') {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
}

function getHeatmapStroke(durationMs?: number, enabled?: boolean) {
  if (!enabled || typeof durationMs !== 'number') {
    return undefined;
  }

  if (durationMs > 2000) {
    return '#ef4444';
  }

  if (durationMs >= 500) {
    return '#f59e0b';
  }

  return undefined;
}

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<CustomEdgeData>) {
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.label;
  const durationLabel = formatDuration(data?.durationMs);
  const heatmapStroke = getHeatmapStroke(data?.durationMs, data?.heatmapActive);
  const edgeStyle = {
    ...style,
    stroke: heatmapStroke ?? style?.stroke,
    opacity: heatmapStroke ? 1 : style?.opacity,
    filter: heatmapStroke ? 'none' : style?.filter,
  };

  const labelClassName =
    label === 'true'
      ? 'border-green-500/30 bg-green-500/15 text-green-200'
      : label === 'false'
        ? 'border-red-500/30 bg-red-500/15 text-red-200'
        : 'border-zinc-600/50 bg-zinc-800/80 text-zinc-100';

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="react-flow__edge-interaction"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <EdgeLabelRenderer>
        {(label || (isHovered && durationLabel && data?.heatmapActive)) && (
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="flex flex-col items-center gap-1">
              {label ? (
                <div className={`rounded-full border px-1.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur ${labelClassName}`}>
                  {label}
                </div>
              ) : null}
              {isHovered && durationLabel && data?.heatmapActive ? (
                <div className="rounded-full border border-zinc-600/40 bg-zinc-900/85 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100 shadow-sm backdrop-blur">
                  {durationLabel}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default CustomEdge;
