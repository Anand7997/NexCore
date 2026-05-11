/**
 * Intent compiler service.
 *
 * Transforms a list of authored intent steps into compiled execution nodes
 * for a specific target platform. The compiler is intentionally stateless –
 * it only reads the registry and produces a deterministic result.
 *
 * Execution adapters are NOT imported here. Adapter isolation is enforced
 * by only storing adapter keys (strings) in compiled node output.
 */
import { Injectable } from '@nestjs/common';
import type {
  IntentStep,
  CompiledNode,
  CompilationIssue,
  MissingParamIssue,
  IntentCompilationResult,
  ExecutionPlatformKey,
} from '../../contracts/intent-contracts';
import { INTENT_SCHEMA_VERSION, EXECUTION_PLATFORM_KEYS } from '../../contracts/intent-contracts';
import { getIntent } from './intent-registry';

@Injectable()
export class IntentCompilerService {
  /**
   * Compile an ordered list of intent steps for the given platform.
   *
   * - Unknown intents → unsupported
   * - Intents with status='unsupported' → unsupported
   * - Intents with status='partial' → partial (also added to unsupported list for strict consumers)
   * - Missing required params → flagged but node is still emitted (non-blocking)
   */
  compile(
    platform: string,
    steps: IntentStep[],
  ): IntentCompilationResult {
    if (!(EXECUTION_PLATFORM_KEYS as readonly string[]).includes(platform)) {
      return {
        valid: false,
        schemaVersion: INTENT_SCHEMA_VERSION,
        platform: platform as ExecutionPlatformKey,
        compiledNodes: [],
        unsupported: [
          {
            stepIndex: 0,
            intent: '',
            reason: `Unknown platform '${platform}'. Valid platforms: ${EXECUTION_PLATFORM_KEYS.join(', ')}.`,
          },
        ],
        partial: [],
        missingParams: [],
      };
    }

    const p = platform as ExecutionPlatformKey;
    const compiledNodes: CompiledNode[] = [];
    const unsupported: CompilationIssue[] = [];
    const partial: CompilationIssue[] = [];
    const missingParams: MissingParamIssue[] = [];

    steps.forEach((step, idx) => {
      const stepIndex = idx + 1;
      const intentId = String(step.intent ?? '').trim();
      const params: Record<string, unknown> = step.params ?? {};

      const intent = getIntent(intentId);
      if (!intent) {
        unsupported.push({
          stepIndex,
          intent: intentId,
          reason: `Intent '${intentId}' is not registered in the intent catalog.`,
        });
        return;
      }

      const mapping = intent.mappings[p];

      // Check required params
      const missing = mapping.requiredParams.filter(
        (name) => params[name] === undefined || params[name] === null || params[name] === '',
      );
      if (missing.length > 0) {
        missingParams.push({ stepIndex, intent: intentId, params: missing });
      }

      if (mapping.status === 'unsupported') {
        unsupported.push({ stepIndex, intent: intentId, reason: mapping.reason });
        return;
      }

      if (mapping.status === 'partial') {
        partial.push({ stepIndex, intent: intentId, reason: mapping.reason });
        // Partial intents do not emit nodes – they must be resolved by the author.
        return;
      }

      if (!mapping.nodeType) return;

      const config: Record<string, unknown> = { ...params };
      if (p === 'android' || p === 'ios') {
        config['platform'] ??= p;
      }

      compiledNodes.push({
        nodeKey: `intent_${stepIndex}_${intentId.replace(/\./g, '_')}`,
        type: mapping.nodeType,
        label: step.label ?? intent.label,
        description: intent.description,
        config,
        intent: intentId,
        adapter: mapping.adapter,
      });
    });

    return {
      valid: unsupported.length === 0 && partial.length === 0 && missingParams.length === 0,
      schemaVersion: INTENT_SCHEMA_VERSION,
      platform: p,
      compiledNodes,
      unsupported,
      partial,
      missingParams,
    };
  }
}
