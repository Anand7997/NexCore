/**
 * Demo landing page – stable fixture for Playwright web plugin tests.
 * All interactive elements carry data-testid attributes for reliable selection.
 */
import DemoCounterWidget from './DemoCounterWidget';

export const metadata = { title: 'Demo – NexCore QA Fixture' };

export default function DemoPage() {
  return (
    <main
      data-testid="demo-main"
      className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-start p-10 gap-10"
    >
      {/* ── Hero ── */}
      <section data-testid="demo-hero" className="w-full max-w-2xl text-center">
        <h1 data-testid="demo-heading" className="text-3xl font-bold mb-2">
          NexCore Demo Fixture
        </h1>
        <p data-testid="demo-subtitle" className="text-gray-400">
          Stable page for Playwright web plugin verification.
        </p>
      </section>

      {/* ── Navigation links ── */}
      <nav data-testid="demo-nav" className="flex gap-4">
        <a
          href="/demo/form"
          data-testid="nav-form"
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          Form Fixture
        </a>
        <a
          href="/demo/api"
          data-testid="nav-api"
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 transition-colors"
        >
          API Fixture
        </a>
        <a
          href="/demo/upload"
          data-testid="nav-upload"
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 transition-colors"
        >
          Upload Fixture
        </a>
      </nav>

      {/* ── Status cards ── */}
      <section data-testid="demo-cards" className="w-full max-w-2xl grid grid-cols-3 gap-4">
        {[
          { id: 'card-web', label: 'Web Plugin', status: 'ready' },
          { id: 'card-api', label: 'API Plugin', status: 'ready' },
          { id: 'card-artifacts', label: 'Artifacts', status: 'ready' },
        ].map((c) => (
          <div
            key={c.id}
            data-testid={c.id}
            className="rounded-lg border border-gray-700 p-4 text-center"
          >
            <span data-testid={`${c.id}-label`} className="block text-sm font-semibold">
              {c.label}
            </span>
            <span
              data-testid={`${c.id}-status`}
              className="block text-xs mt-1 text-emerald-400"
            >
              {c.status}
            </span>
          </div>
        ))}
      </section>

      {/* ── Counter widget (JS interaction) ── */}
      <DemoCounterWidget />
    </main>
  );
}
