'use client';

import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface PendingApproval {
  executionId: string;
  nodeId: string;
  title: string;
  message: string;
}

interface ApprovalBannerProps {
  approval: PendingApproval;
  onDecisionSubmitted?: () => void;
}

export function ApprovalBanner({ approval, onDecisionSubmitted }: ApprovalBannerProps) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  const submitDecision = async (nextDecision: 'approved' | 'rejected') => {
    if (decision) {
      return;
    }

    setDecision(nextDecision);
    try {
      const response = await fetch(`/api/executions/${approval.executionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: approval.nodeId, decision: nextDecision }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to submit approval');
      }

      toast({
        title: nextDecision === 'approved' ? 'Step approved' : 'Step rejected',
        description: 'Workflow execution has been updated.',
      });
      onDecisionSubmitted?.();
    } catch (error) {
      toast({
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setDecision(null);
    }
  };

  const isSubmitting = Boolean(decision);

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-700">{approval.title}</p>
          <p className="text-sm text-amber-900/80">{approval.message}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-amber-600/40 bg-white/60 text-amber-800 hover:bg-white"
            onClick={() => void submitDecision('approved')}
            disabled={isSubmitting}
          >
            {decision === 'approved' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-amber-600/40 bg-white/60 text-amber-800 hover:bg-white"
            onClick={() => void submitDecision('rejected')}
            disabled={isSubmitting}
          >
            {decision === 'rejected' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
