import { redirect } from 'next/navigation';
import { AutomationPhaseWorkspace } from '@/components/AutomationPhaseWorkspace';

export default async function AutomationPhasePage({
  params,
}: {
  params: Promise<{ automationId: string; phaseId: string }>;
}) {
  const { automationId, phaseId } = await params;
  if (phaseId === 'development') {
    redirect(`/test-configuration?automation_space=${encodeURIComponent(automationId)}`);
  }

  return <AutomationPhaseWorkspace automationId={automationId} phaseId={phaseId} />;
}
