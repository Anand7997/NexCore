import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

let sdk: NodeSDK | null = null;

export function initTelemetry(serviceName: string): void {
  const prometheusExporter = new PrometheusExporter({
    port: 9464,
    endpoint: '/metrics',
  });

  sdk = new NodeSDK({
    serviceName,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation generates too much noise
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(console.error);
  });
}
