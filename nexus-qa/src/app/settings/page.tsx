'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Bell, Shield, Cpu,
  Webhook, Key, Users, Save, RefreshCw, CheckCircle, AlertTriangle, XCircle,
} from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { useAdapterRuntimes, type AdapterRuntime } from '@/lib/api/adapters';
import { useIntegrations, type Integration } from '@/lib/api/enterprise';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security & Auth', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Webhook },
  { id: 'agents', label: 'Agent Config', icon: Cpu },
  { id: 'team', label: 'Team', icon: Users },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative w-10 h-5 rounded-full transition-all duration-300',
        enabled ? 'bg-indigo-500' : 'bg-white/10',
      )}
    >
      <motion.div
        animate={{ x: enabled ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
      />
    </button>
  );
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/4">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function RuntimeStatusIcon({ status }: { status: AdapterRuntime['status'] }) {
  if (status === 'available') return <CheckCircle size={13} className="text-emerald-400" />;
  if (status === 'configured') return <AlertTriangle size={13} className="text-amber-400" />;
  return <XCircle size={13} className="text-slate-600" />;
}

function AdapterRuntimeRow({ runtime }: { runtime: AdapterRuntime }) {
  return (
    <div className="border-b border-white/4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RuntimeStatusIcon status={runtime.status} />
            <p className="text-sm text-slate-200">{runtime.runtime}</p>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {runtime.adapter} · {runtime.endpoint ?? 'endpoint not configured'}
          </p>
        </div>
        <span className={cn(
          'rounded-md border px-2 py-1 text-[10px] font-mono uppercase',
          runtime.status === 'available' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
          runtime.status === 'configured' && 'border-amber-500/25 bg-amber-500/10 text-amber-300',
          runtime.status === 'unavailable' && 'border-white/8 bg-white/5 text-slate-500',
        )}>
          {runtime.status}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {runtime.isolation.map((item) => (
          <span key={item} className="rounded border border-white/6 bg-white/3 px-2 py-1 text-[10px] text-slate-500">
            {item}
          </span>
        ))}
      </div>
      {runtime.diagnostics.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">{runtime.diagnostics[0]}</p>
      )}
    </div>
  );
}

const INTEGRATION_TYPE_LABELS: Record<string, string> = {
  slack: 'Slack',
  jira: 'Jira',
  github: 'GitHub',
  webhook: 'Webhook',
  s3: 'AWS S3',
  datadog: 'Datadog',
};

function IntegrationRow({ integration }: { integration: Integration }) {
  const label = INTEGRATION_TYPE_LABELS[integration.integration_type] ?? integration.integration_type;
  return (
    <div className="flex items-center gap-3 border-b border-white/4 py-3 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/8">
        <Webhook size={13} className="text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{integration.name}</p>
        <p className="text-[10px] font-mono text-slate-500 mt-0.5">{label}</p>
      </div>
      <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
        active
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');
  const { data: adapterRuntimes } = useAdapterRuntimes();
  const { data: integrations = [], isError: integrationsError } = useIntegrations();
  const [settings, setSettings] = useState({
    liveStream: true,
    aiAnalysis: true,
    autoRetry: false,
    darkMode: true,
    compactView: false,
    emailAlerts: true,
    slackAlerts: false,
    webhooks: true,
    twoFactor: false,
    ssoEnabled: false,
  });

  const toggle = (key: keyof typeof settings) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 shrink-0 glass border-r border-white/5 py-4">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all',
              activeSection === s.id
                ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
            )}
          >
            <s.icon size={14} className={activeSection === s.id ? 'text-indigo-400' : 'text-slate-500'} />
            <span className="text-xs font-medium">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl space-y-6"
        >
          {activeSection === 'general' && (
            <>
              <div>
                <h1 className="text-xl font-bold text-white">General Settings</h1>
                <p className="text-xs text-slate-400 mt-1">Platform-wide configuration</p>
              </div>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Execution</h3>
                <SettingRow label="Live Stream" description="Stream execution events in real-time">
                  <Toggle enabled={settings.liveStream} onChange={() => toggle('liveStream')} />
                </SettingRow>
                <SettingRow label="AI Analysis" description="Enable AI-powered root cause analysis">
                  <Toggle enabled={settings.aiAnalysis} onChange={() => toggle('aiAnalysis')} />
                </SettingRow>
                <SettingRow label="Auto Retry" description="Automatically retry failed nodes (up to 3x)">
                  <Toggle enabled={settings.autoRetry} onChange={() => toggle('autoRetry')} />
                </SettingRow>
              </GlassCard>

              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Appearance</h3>
                <SettingRow label="Dark Mode" description="Force dark theme">
                  <Toggle enabled={settings.darkMode} onChange={() => toggle('darkMode')} />
                </SettingRow>
                <SettingRow label="Compact View" description="Reduce spacing for information density">
                  <Toggle enabled={settings.compactView} onChange={() => toggle('compactView')} />
                </SettingRow>
              </GlassCard>

              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Environment</h3>
                <SettingRow label="Active Environment">
                  <select className="bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/40">
                    <option value="prod">Production</option>
                    <option value="staging">Staging</option>
                    <option value="dev">Development</option>
                    <option value="qa">QA</option>
                  </select>
                </SettingRow>
                <SettingRow label="Default Timeout">
                  <input
                    defaultValue="30000"
                    className="w-28 bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-slate-300 text-right focus:outline-none focus:border-indigo-500/40"
                  />
                </SettingRow>
              </GlassCard>
            </>
          )}

          {activeSection === 'notifications' && (
            <>
              <div>
                <h1 className="text-xl font-bold text-white">Notifications</h1>
                <p className="text-xs text-slate-400 mt-1">Configure alert channels and thresholds</p>
              </div>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Channels</h3>
                <SettingRow label="Email Alerts" description="Send failure notifications via email">
                  <Toggle enabled={settings.emailAlerts} onChange={() => toggle('emailAlerts')} />
                </SettingRow>
                <SettingRow label="Slack Integration" description="Post alerts to Slack channels">
                  <Toggle enabled={settings.slackAlerts} onChange={() => toggle('slackAlerts')} />
                </SettingRow>
                <SettingRow label="Webhooks" description="Send execution events to webhook endpoints">
                  <Toggle enabled={settings.webhooks} onChange={() => toggle('webhooks')} />
                </SettingRow>
              </GlassCard>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Thresholds</h3>
                <SettingRow label="Alert on failure rate above">
                  <div className="flex items-center gap-2">
                    <input defaultValue="5" className="w-16 bg-white/5 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-slate-300 text-right focus:outline-none focus:border-indigo-500/40" />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </SettingRow>
                <SettingRow label="Alert on duration above">
                  <div className="flex items-center gap-2">
                    <input defaultValue="60" className="w-16 bg-white/5 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-slate-300 text-right focus:outline-none focus:border-indigo-500/40" />
                    <span className="text-xs text-slate-500">s</span>
                  </div>
                </SettingRow>
              </GlassCard>
            </>
          )}

          {activeSection === 'security' && (
            <>
              <div>
                <h1 className="text-xl font-bold text-white">Security & Auth</h1>
                <p className="text-xs text-slate-400 mt-1">Authentication and access control</p>
              </div>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Authentication</h3>
                <SettingRow label="Two-Factor Authentication" description="Require 2FA for all users">
                  <Toggle enabled={settings.twoFactor} onChange={() => toggle('twoFactor')} />
                </SettingRow>
                <SettingRow label="SSO / SAML" description="Enable enterprise single sign-on">
                  <Toggle enabled={settings.ssoEnabled} onChange={() => toggle('ssoEnabled')} />
                </SettingRow>
              </GlassCard>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">API Keys</h3>
                <div className="space-y-2">
                  {['nexus-prod-key-***4f2a', 'nexus-ci-key-***8b1c'].map((key) => (
                    <div key={key} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/2 border border-white/6">
                      <Key size={12} className="text-slate-500 shrink-0" />
                      <span className="text-xs font-mono text-slate-400 flex-1">{key}</span>
                      <button className="text-[10px] text-red-400 hover:text-red-300 font-mono">revoke</button>
                    </div>
                  ))}
                </div>
                <button className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 text-xs hover:bg-indigo-500/25 transition-all">
                  <Key size={11} />
                  Generate New Key
                </button>
              </GlassCard>
            </>
          )}

          {activeSection === 'agents' && (
            <>
              <div>
                <h1 className="text-xl font-bold text-white">Agent Config</h1>
                <p className="text-xs text-slate-400 mt-1">Mobile and desktop adapter readiness</p>
              </div>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Adapter Runtimes</h3>
                {adapterRuntimes?.runtimes?.length ? (
                  adapterRuntimes.runtimes.map((runtime) => (
                    <AdapterRuntimeRow key={runtime.adapter} runtime={runtime} />
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    Runtime status will appear after the API process is restarted.
                  </div>
                )}
              </GlassCard>
            </>
          )}

          {activeSection === 'integrations' && (
            <>
              <div>
                <h1 className="text-xl font-bold text-white">Integrations</h1>
                <p className="text-xs text-slate-400 mt-1">Connected third-party services</p>
              </div>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Active Integrations</h3>
                {integrationsError && (
                  <p className="text-xs text-red-400 font-mono py-2">
                    Unable to load integrations — admin role required.
                  </p>
                )}
                {!integrationsError && integrations.length === 0 && (
                  <p className="py-4 text-center text-xs text-slate-500">No integrations configured yet.</p>
                )}
                {integrations.map((integ) => (
                  <IntegrationRow key={integ.id} integration={integ} />
                ))}
              </GlassCard>
              <GlassCard className="p-4" animate={false}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add Integration</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(INTEGRATION_TYPE_LABELS).map(([type, label]) => (
                    <button
                      key={type}
                      className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 text-xs text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-all"
                    >
                      <Webhook size={11} className="text-indigo-400 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </GlassCard>
            </>
          )}

          {activeSection === 'team' && (
            <div className="flex items-center justify-center h-48 text-slate-600">
              <div className="text-center">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Team management requires tenant configuration.</p>
                <p className="text-xs mt-1">Configure a tenant via the enterprise API to manage members.</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-500/30 transition-all">
              <Save size={12} />
              Save Changes
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/8 text-slate-400 text-xs hover:bg-white/10 transition-all">
              <RefreshCw size={12} />
              Reset Defaults
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
