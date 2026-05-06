import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { webhookLogs, webhooks } from '@/lib/db/schema';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';

async function parseRequestBody(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return null;
  }

  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return await request.json();
    }

    const text = await request.text();
    return text ? { raw: text } : null;
  } catch {
    return null;
  }
}

async function logWebhookRequest(
  webhookId: string,
  request: NextRequest,
  body: unknown,
  statusCode: number,
  response: unknown,
  executionId?: string,
  startedAt = Date.now()
) {
  await db.insert(webhookLogs).values({
    webhookId,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    queryParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
    statusCode,
    response,
    executionId,
    durationMs: Date.now() - startedAt,
    receivedAt: new Date(),
  });
}

async function handleWebhook(request: NextRequest, path: string) {
  const startedAt = Date.now();
  const body = await parseRequestBody(request);
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.urlPath, path))
    .limit(1);

  if (!webhook) {
    return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
  }

  if (!webhook.isActive) {
    await logWebhookRequest(webhook.id, request, body, 410, { success: false, error: 'Webhook is inactive' }, undefined, startedAt);
    return NextResponse.json({ success: false, error: 'Webhook is inactive' }, { status: 410 });
  }

  const allowedMethod = webhook.httpMethod?.toUpperCase() ?? 'POST';
  if (allowedMethod !== request.method.toUpperCase()) {
    await logWebhookRequest(webhook.id, request, body, 405, { success: false, error: 'Method not allowed' }, undefined, startedAt);
    return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  if (webhook.authType === 'bearer') {
    const expectedToken = typeof webhook.authConfig === 'object' && webhook.authConfig !== null
      ? (webhook.authConfig as Record<string, unknown>).token
      : undefined;
    const authHeader = request.headers.get('authorization') ?? '';
    const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!expectedToken || providedToken !== expectedToken) {
      await logWebhookRequest(webhook.id, request, body, 401, { success: false, error: 'Unauthorized' }, undefined, startedAt);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const input = {
    body,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    method: request.method,
    receivedAt: new Date().toISOString(),
    webhookId: webhook.id,
    webhookPath: webhook.urlPath,
  };

  const execution = await startWorkflowExecution({
    workflowId: webhook.workflowId,
    triggerType: 'webhook',
    input,
    metadata: {
      webhookId: webhook.id,
      webhookPath: webhook.urlPath,
      source: 'webhook',
    },
  });

  const response = {
    success: true,
    data: {
      executionId: execution.id,
      status: 'accepted',
    },
  };

  await logWebhookRequest(webhook.id, request, body, 202, response.data, execution.id, startedAt);
  return NextResponse.json(response, { status: 202 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return handleWebhook(request, path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return handleWebhook(request, path);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return handleWebhook(request, path);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return handleWebhook(request, path);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return handleWebhook(request, path);
}
