import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';
import PhaseStepCard from '@/components/ui/phase-step-card';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Server,
  X,
} from 'lucide-react';

interface JenkinsStatus {
  configured: boolean;
  reachable: boolean;
  base_url: string;
  job_name: string;
  message?: string;
  error?: string;
}

interface TriggerResponse {
  success: boolean;
  message: string;
  queue_url?: string;
  queue_id?: string;
  build_number?: number;
  build_url?: string;
  error?: string;
}

interface QueueStatus {
  success: boolean;
  queued?: boolean;
  why?: string;
  queue_url?: string;
  queue_id?: string;
  build_number?: number;
  build_url?: string;
  error?: string;
}

interface BuildStatus {
  success: boolean;
  building?: boolean;
  result?: string | null;
  url?: string;
  display_name?: string;
  timestamp?: number;
  duration?: number;
  error?: string;
}

interface BuildHistoryItem {
  number: number;
  url?: string;
  result?: string | null;
  building?: boolean;
  display_name?: string;
  timestamp?: number;
  duration?: number;
}

interface BuildHistoryResponse {
  success: boolean;
  builds?: BuildHistoryItem[];
  error?: string;
}

interface CicdPipelineDashboardProps {
  onBack?: () => void;
  initialTab?: 'jenkins' | 'git';
}

const STORED_REPO_URL_KEY = 'cicd.jenkins.repoUrl';

const CicdPipelineDashboard: React.FC<CicdPipelineDashboardProps> = ({
  onBack,
  initialTab = 'jenkins',
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [jenkinsStatus, setJenkinsStatus] = useState<JenkinsStatus | null>(null);
  const [repoUrl, setRepoUrl] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(STORED_REPO_URL_KEY) || '';
  });
  const [branch, setBranch] = useState('main');
  const [parameters, setParameters] = useState('BRANCH=main\nREPO_URL=');
  const [triggering, setTriggering] = useState(false);
  const [resolvingBuild, setResolvingBuild] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastTrigger, setLastTrigger] = useState<TriggerResponse | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null);
  const [buildHistory, setBuildHistory] = useState<BuildHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    loadJenkinsStatus();
    loadBuildHistory();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (repoUrl.trim()) {
      window.localStorage.setItem(STORED_REPO_URL_KEY, repoUrl);
    } else {
      window.localStorage.removeItem(STORED_REPO_URL_KEY);
    }
  }, [repoUrl]);

  useEffect(() => {
    setParameters((current) => {
      const lines = current.split('\n').filter(Boolean);
      const customLines = lines.filter((line) => !line.startsWith('BRANCH=') && !line.startsWith('REPO_URL='));
      return [`BRANCH=${branch}`, `REPO_URL=${repoUrl}`, ...customLines].join('\n');
    });
  }, [branch, repoUrl]);

  const loadJenkinsStatus = async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch(buildApiUrl('/api/cicd/jenkins/status'));
      const data = await response.json();
      setJenkinsStatus(data);
    } catch (error) {
      setJenkinsStatus({
        configured: false,
        reachable: false,
        base_url: 'http://localhost:8080',
        job_name: '',
        error: 'Unable to reach backend CI-CD endpoint.',
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadBuildHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await fetch(buildApiUrl('/api/cicd/jenkins/history?limit=50'));
      const data: BuildHistoryResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load Jenkins build history.');
      }

      setBuildHistory(data.builds || []);
    } catch (error) {
      setBuildHistory([]);
      setHistoryError(error instanceof Error ? error.message : 'Unable to load Jenkins build history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const clearRepoUrl = () => {
    setRepoUrl('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORED_REPO_URL_KEY);
    }
  };

  const parseParameters = () => {
    const parsed: Record<string, string> = {};
    parameters
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex > -1) {
          const key = line.slice(0, separatorIndex).trim();
          const value = line.slice(separatorIndex + 1).trim();
          if (key) {
            parsed[key] = value;
          }
        }
      });
    return parsed;
  };

  const triggerJenkins = async () => {
    setTriggering(true);
    setResolvingBuild(false);
    setBuildStatus(null);
    try {
      const response = await fetch(buildApiUrl('/api/cicd/jenkins/trigger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl,
          branch,
          parameters: parseParameters(),
        }),
      });
      const data = await response.json();
      setLastTrigger(data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to trigger Jenkins.');
      }

      toast({
        title: 'Jenkins Triggered',
        description: data.build_number ? `Build #${data.build_number} started. Live build link is ready.` : 'Build queued successfully. Resolving live build link.',
      });

      if (data.build_number) {
        await loadBuildStatus(data.build_number);
        await loadBuildHistory();
      } else if (data.queue_id) {
        resolveQueuedBuild(data.queue_id, data);
      }
    } catch (error) {
      toast({
        title: 'Jenkins Trigger Failed',
        description: error instanceof Error ? error.message : 'Unable to trigger Jenkins.',
        variant: 'destructive',
      });
    } finally {
      setTriggering(false);
    }
  };

  const resolveQueuedBuild = async (queueId: string, triggerData?: TriggerResponse) => {
    setResolvingBuild(true);
    const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(buildApiUrl(`/api/cicd/jenkins/queue/${queueId}`));
        const data: QueueStatus = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Unable to resolve Jenkins queue item.');
        }

        setLastTrigger((current) => ({
          ...(triggerData || current || { success: true, message: 'Jenkins pipeline triggered successfully.' }),
          queue_url: data.queue_url || triggerData?.queue_url || current?.queue_url,
          queue_id: data.queue_id || queueId,
          build_number: data.build_number || current?.build_number,
          build_url: data.build_url || current?.build_url,
        }));

        if (data.build_number) {
          toast({
            title: 'Jenkins Build Live',
            description: `Build #${data.build_number} link is ready.`,
          });
          await loadBuildStatus(data.build_number);
          await loadBuildHistory();
          setResolvingBuild(false);
          return;
        }
      } catch (error) {
        console.error('Failed to resolve Jenkins queue item:', error);
      }

      await sleep(2000);
    }

    toast({
      title: 'Jenkins Build Still Queued',
      description: 'Open the queue link for now; the build link will appear after Jenkins assigns a build number.',
    });
    setResolvingBuild(false);
  };

  const loadBuildStatus = async (buildNumber?: number) => {
    const numberToUse = buildNumber || lastTrigger?.build_number;
    if (!numberToUse) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/cicd/jenkins/build/${numberToUse}`));
      const data = await response.json();
      setBuildStatus(data);
    } catch (error) {
      setBuildStatus({
        success: false,
        error: 'Unable to load Jenkins build status.',
      });
    }
  };

  const statusBadge = () => {
    if (!jenkinsStatus) {
      return <Badge variant="secondary">Checking</Badge>;
    }
    if (!jenkinsStatus.configured) {
      return <Badge variant="destructive">Not Configured</Badge>;
    }
    if (!jenkinsStatus.reachable) {
      return <Badge variant="destructive">Offline</Badge>;
    }
    return <Badge className="bg-emerald-600 text-white">Ready</Badge>;
  };

  const buildResultBadge = (build: BuildHistoryItem) => {
    if (build.building) {
      return <Badge className="bg-blue-600 text-white">Running</Badge>;
    }
    if (build.result === 'SUCCESS') {
      return <Badge className="bg-emerald-600 text-white">Success</Badge>;
    }
    if (build.result === 'FAILURE') {
      return <Badge variant="destructive">Failed</Badge>;
    }
    if (build.result === 'ABORTED') {
      return <Badge variant="secondary">Aborted</Badge>;
    }
    return <Badge variant="secondary">{build.result || 'Queued'}</Badge>;
  };

  const formatBuildTime = (timestamp?: number) => {
    if (!timestamp) {
      return '-';
    }
    return new Date(timestamp).toLocaleString();
  };

  const renderRepoInput = (id: string) => (
    <div className="flex gap-2">
      <Input
        id={id}
        value={repoUrl}
        onChange={(event) => setRepoUrl(event.target.value)}
        placeholder="https://github.com/org/repo.git"
      />
      {repoUrl && (
        <Button type="button" variant="outline" size="icon" onClick={clearRepoUrl} aria-label="Clear repository URL">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <PageBackButton onClick={onBack} label="Back" />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">CI-CD Pipeline</h1>
          <p className="text-muted-foreground">
            Trigger Jenkins jobs and pass Git pipeline parameters from the automation platform.
          </p>
        </div>
        <div />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5" />
              Jenkins EC2 Connection
            </CardTitle>
            <div className="flex items-center gap-2">
              {statusBadge()}
              <Button variant="outline" size="sm" onClick={loadJenkinsStatus} disabled={loadingStatus}>
                {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Jenkins URL</p>
            <p className="mt-1 break-all text-sm text-foreground">{jenkinsStatus?.base_url || 'http://localhost:8080'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Job Name</p>
            <p className="mt-1 text-sm text-foreground">{jenkinsStatus?.job_name || 'Set JENKINS_JOB_NAME'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Runtime</p>
            <p className="mt-1 text-sm text-foreground">Backend triggers Jenkins from EC2</p>
          </div>
          {(jenkinsStatus?.error || jenkinsStatus?.message) && (
            <Alert className="md:col-span-3" variant={jenkinsStatus?.reachable ? 'default' : 'destructive'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{jenkinsStatus.error || jenkinsStatus.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Pipeline phase sub-steps - same card anatomy as the Home phase cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PhaseStepCard
          icon={Server}
          title="Jenkins Pipeline"
          description="Trigger Jenkins builds on EC2 with repository and branch parameters"
          step="Step 1"
          accent="teal"
          onClick={() => setActiveTab('jenkins')}
        />
        <PhaseStepCard
          icon={GitBranch}
          title="Git Pipeline"
          description="Pass Git pipeline inputs such as repository URL and target branch"
          step="Step 2"
          accent="indigo"
          onClick={() => setActiveTab('git')}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="jenkins" className="gap-2">
            <Server className="h-4 w-4" />
            Jenkins Pipeline
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Git Pipeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jenkins" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trigger Jenkins Build</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="jenkins-repo">Repository URL</Label>
                  {renderRepoInput('jenkins-repo')}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jenkins-branch">Branch</Label>
                  <Input
                    id="jenkins-branch"
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    placeholder="main"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jenkins-params">Build Parameters</Label>
                <textarea
                  id="jenkins-params"
                  value={parameters}
                  onChange={(event) => setParameters(event.target.value)}
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <Button onClick={triggerJenkins} disabled={triggering || !jenkinsStatus?.configured} className="gap-2">
                {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Trigger Jenkins
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="git" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Git Pipeline Inputs</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="git-repo">Repository URL</Label>
                {renderRepoInput('git-repo')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="git-branch">Branch</Label>
                <Input id="git-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
              </div>
              <Alert className="md:col-span-2">
                <GitBranch className="h-4 w-4" />
                <AlertDescription>
                  These Git values are sent as Jenkins build parameters, so the Jenkinsfile can checkout the selected repository and branch.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {lastTrigger && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastTrigger.success ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
              Last Jenkins Trigger
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{lastTrigger.message || lastTrigger.error}</p>
            {(lastTrigger.build_url || lastTrigger.queue_url) && (
              <Alert>
                {resolvingBuild && !lastTrigger.build_url ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {lastTrigger.build_url
                      ? 'Live Jenkins build link is ready.'
                      : 'Jenkins accepted the trigger and the build link is being prepared.'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(lastTrigger.build_url || lastTrigger.queue_url, '_blank')}
                    className="w-fit gap-2"
                  >
                    {lastTrigger.build_url ? 'Open Live Build' : 'Open Queue'}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {lastTrigger.build_number && <Badge variant="secondary">Build #{lastTrigger.build_number}</Badge>}
              {resolvingBuild && !lastTrigger.build_number && <Badge variant="secondary">Resolving build link...</Badge>}
              {lastTrigger.queue_url && (
                <Button variant="outline" size="sm" onClick={() => window.open(lastTrigger.queue_url, '_blank')} className="gap-2">
                  Queue <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
              {lastTrigger.build_url && (
                <Button variant="outline" size="sm" onClick={() => window.open(lastTrigger.build_url, '_blank')} className="gap-2">
                  Build <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
              {lastTrigger.build_number && (
                <Button variant="outline" size="sm" onClick={() => loadBuildStatus()} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh Status
                </Button>
              )}
            </div>
            {buildStatus && (
              <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
                {buildStatus.success ? (
                  <div className="grid gap-2 md:grid-cols-3">
                    <span>Status: {buildStatus.building ? 'Running' : buildStatus.result || 'Queued'}</span>
                    <span>Name: {buildStatus.display_name || 'Jenkins build'}</span>
                    <span>Duration: {Math.round((buildStatus.duration || 0) / 1000)}s</span>
                  </div>
                ) : (
                  <span className="text-destructive">{buildStatus.error}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5" />
              Jenkins Build History
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadBuildHistory} disabled={loadingHistory} className="w-fit gap-2">
              {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historyError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{historyError}</AlertDescription>
            </Alert>
          ) : buildHistory.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {loadingHistory ? 'Loading build history...' : 'No Jenkins builds found yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <div className="grid min-w-[760px] grid-cols-[110px_130px_1fr_190px_110px_90px] border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                <span>Build</span>
                <span>Status</span>
                <span>Name</span>
                <span>Started</span>
                <span>Duration</span>
                <span>Link</span>
              </div>
              {buildHistory.map((build) => (
                <div
                  key={build.number}
                  className="grid min-w-[760px] grid-cols-[110px_130px_1fr_190px_110px_90px] items-center border-b px-3 py-3 text-sm last:border-b-0"
                >
                  <span className="font-medium">#{build.number}</span>
                  <span>{buildResultBadge(build)}</span>
                  <span className="truncate pr-3">{build.display_name || `Build #${build.number}`}</span>
                  <span className="text-muted-foreground">{formatBuildTime(build.timestamp)}</span>
                  <span className="text-muted-foreground">{Math.round((build.duration || 0) / 1000)}s</span>
                  <span>
                    {build.url && (
                      <Button variant="outline" size="sm" onClick={() => window.open(build.url, '_blank')} className="gap-2">
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CicdPipelineDashboard;
