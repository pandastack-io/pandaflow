import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ChatInterface } from '@/components/chat/chat-interface';
import { isUuid, resolveChatSettings } from '@/lib/chat';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';

async function getWorkflow(id: string) {
  const [byPublicId] = await db.select().from(workflows).where(eq(workflows.chatPublicId, id)).limit(1);
  if (byPublicId) {
    return byPublicId;
  }

  if (!isUuid(id)) {
    return null;
  }

  const [byId] = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  return byId ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const workflow = await getWorkflow(id);
  const settings = resolveChatSettings(workflow?.chatSettings, workflow?.name);

  return {
    title: workflow ? `${settings.title} | AI Agent Builder` : 'Chat Assistant',
    description: settings.welcomeMessage,
    openGraph: {
      title: settings.title,
      description: settings.welcomeMessage,
    },
    twitter: {
      card: 'summary_large_image',
      title: settings.title,
      description: settings.welcomeMessage,
    },
  };
}

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embedded?: string }>;
}) {
  const { id } = await params;
  const { embedded } = await searchParams;
  const workflow = await getWorkflow(id);

  if (!workflow || workflow.workflowType !== 'chat' || !workflow.isPublic) {
    notFound();
  }

  return (
    <ChatInterface
      chatId={workflow.chatPublicId || workflow.id}
      workflowName={workflow.name}
      chatSettings={workflow.chatSettings as Record<string, unknown> | null}
      embedded={embedded === 'true'}
    />
  );
}
