import type { SimpleIcon } from 'simple-icons';
import { cn } from '@/lib/utils';

export interface ExtendedSimpleIcon extends SimpleIcon {
  viewBox?: string;
}

interface BrandIconProps {
  icon: ExtendedSimpleIcon;
  className?: string;
  size?: number;
  branded?: boolean;
}

export function BrandIcon({ icon, className, size = 20, branded = false }: BrandIconProps) {
  return (
    <svg
      role="img"
      viewBox={icon.viewBox ?? '0 0 24 24'}
      width={size}
      height={size}
      className={cn(className)}
      style={branded ? { fill: `#${icon.hex}` } : { fill: 'currentColor' }}
      aria-label={icon.title}
    >
      <path d={icon.path} />
    </svg>
  );
}
