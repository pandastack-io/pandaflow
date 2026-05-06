export type HitlStatus = 'pending' | 'approved' | 'rejected';

export interface HitlApprovalState {
  status: HitlStatus;
  executionId: string;
  nodeId: string;
  title?: string;
  message?: string;
  comment?: string;
  createdAt?: string;
  decidedAt?: string;
}

export function getHitlRedisKey(executionId: string, nodeId: string) {
  return `hitl:${executionId}:${nodeId}`;
}

export function getHitlRedisPattern(executionId: string) {
  return `hitl:${executionId}:*`;
}

export function parseHitlApprovalState(raw: string | null): HitlApprovalState | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as HitlApprovalState;
  } catch {
    return null;
  }
}
