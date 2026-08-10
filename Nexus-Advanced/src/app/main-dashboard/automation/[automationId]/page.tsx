import { AutomationPhasesDashboard } from '@/components/MainDashboard';

export default async function AutomationDashboardPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;

  return <AutomationPhasesDashboard automationId={automationId} />;
}
