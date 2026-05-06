'use client';

import { useToast } from '@/hooks/use-toast';
import { Toast, ToastClose, ToastProvider, ToastViewport } from '@/components/ui/toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1.5 flex-1">
              {title && <div className="text-sm font-semibold leading-none tracking-tight">{title}</div>}
              {description && <div className="text-sm opacity-80 leading-relaxed">{description}</div>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
