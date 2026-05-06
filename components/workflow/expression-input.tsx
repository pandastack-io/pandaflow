'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DataReferencePicker } from './data-reference-picker';

interface ExpressionInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  nodeId?: string;
}

interface ExpressionTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  nodeId?: string;
}

function insertExpression(currentValue: string, expression: string, start: number | null, end: number | null) {
  const template = `{{${expression}}}`;
  if (start === null || end === null) {
    return `${currentValue}${template}`;
  }

  return `${currentValue.slice(0, start)}${template}${currentValue.slice(end)}`;
}

export const ExpressionInput = React.forwardRef<HTMLInputElement, ExpressionInputProps>(
  ({ className, value, onValueChange, nodeId, ...props }, forwardedRef) => {
    const [open, setOpen] = React.useState(false);
    const innerRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

    const handleSelect = (expression: string) => {
      const element = innerRef.current;
      const nextValue = insertExpression(value ?? '', expression, element?.selectionStart ?? null, element?.selectionEnd ?? null);
      onValueChange(nextValue);
      setOpen(false);

      if (element) {
        const cursorPosition = (element.selectionStart ?? value.length) + expression.length + 4;
        requestAnimationFrame(() => {
          element.focus();
          element.setSelectionRange(cursorPosition, cursorPosition);
        });
      }
    };

    return (
      <div className="relative">
        <Input
          ref={innerRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn('pr-11', className)}
          {...props}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!nodeId}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none transition-colors
                bg-primary/10 text-primary border border-primary/30
                hover:bg-primary/20 hover:border-primary/50
                disabled:opacity-30 disabled:cursor-not-allowed"
              title="Insert data reference"
            >
              {'{ }'}
            </button>
          </PopoverTrigger>
          {nodeId ? (
            <PopoverContent align="end" className="w-[360px] p-3">
              <DataReferencePicker nodeId={nodeId} onSelect={handleSelect} />
            </PopoverContent>
          ) : null}
        </Popover>
      </div>
    );
  }
);
ExpressionInput.displayName = 'ExpressionInput';

export const ExpressionTextarea = React.forwardRef<HTMLTextAreaElement, ExpressionTextareaProps>(
  ({ className, value, onValueChange, nodeId, ...props }, forwardedRef) => {
    const [open, setOpen] = React.useState(false);
    const innerRef = React.useRef<HTMLTextAreaElement>(null);

    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    const handleSelect = (expression: string) => {
      const element = innerRef.current;
      const nextValue = insertExpression(value ?? '', expression, element?.selectionStart ?? null, element?.selectionEnd ?? null);
      onValueChange(nextValue);
      setOpen(false);

      if (element) {
        const cursorPosition = (element.selectionStart ?? value.length) + expression.length + 4;
        requestAnimationFrame(() => {
          element.focus();
          element.setSelectionRange(cursorPosition, cursorPosition);
        });
      }
    };

    return (
      <div className="relative">
        <Textarea
          ref={innerRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn('pr-11', className)}
          {...props}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!nodeId}
              className="absolute right-1.5 top-2 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none transition-colors
                bg-primary/10 text-primary border border-primary/30
                hover:bg-primary/20 hover:border-primary/50
                disabled:opacity-30 disabled:cursor-not-allowed"
              title="Insert data reference"
            >
              {'{ }'}
            </button>
          </PopoverTrigger>
          {nodeId ? (
            <PopoverContent align="end" className="w-[360px] p-3">
              <DataReferencePicker nodeId={nodeId} onSelect={handleSelect} />
            </PopoverContent>
          ) : null}
        </Popover>
      </div>
    );
  }
);
ExpressionTextarea.displayName = 'ExpressionTextarea';
