import type { SimpleIcon } from 'simple-icons';
import { cn } from '@/lib/utils';

interface BrandIconProps {
  icon: SimpleIcon;
  className?: string;
  size?: number;
  branded?: boolean;
}

export function BrandIcon({ icon, className, size = 20, branded = false }: BrandIconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
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
