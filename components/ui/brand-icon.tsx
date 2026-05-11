import type { SimpleIcon } from 'simple-icons';
import type { IconType } from 'react-icons';
import { cn } from '@/lib/utils';

export interface ExtendedSimpleIcon extends SimpleIcon {
  viewBox?: string;
}

interface BrandIconProps {
  /** Accepts either a simple-icons object OR a react-icons IconType component */
  icon: ExtendedSimpleIcon | IconType;
  /** Hex color string (no #) for branded display mode */
  hex?: string;
  className?: string;
  size?: number;
  branded?: boolean;
}

export function BrandIcon({ icon, hex, className, size = 20, branded = false }: BrandIconProps) {
  // If it's a React component (react-icons IconType), render it directly
  if (typeof icon === 'function') {
    const ReactIcon = icon as IconType;
    return (
      <ReactIcon
        size={size}
        className={cn(className)}
        style={branded && hex ? { color: `#${hex}` } : undefined}
        aria-label="brand icon"
      />
    );
  }

  // Otherwise render as raw SVG path (simple-icons format)
  const simpleIcon = icon as ExtendedSimpleIcon;
  return (
    <svg
      role="img"
      viewBox={simpleIcon.viewBox ?? '0 0 24 24'}
      width={size}
      height={size}
      className={cn(className)}
      style={branded ? { fill: `#${hex ?? simpleIcon.hex}` } : { fill: 'currentColor' }}
      aria-label={simpleIcon.title}
    >
      <path d={simpleIcon.path} />
    </svg>
  );
}
