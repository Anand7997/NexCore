import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/layout/AppShell';
import { QueryProvider } from '@/components/layout/QueryProvider';

export const metadata: Metadata = {
  title: 'NEXUS QA - Execution Operating System',
  description: 'AI-powered unified execution intelligence workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="readability-boost h-full bg-(--color-bg-base) text-(--color-fg-default) antialiased">
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
