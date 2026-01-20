import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { LLMProvider, BmadPhase } from './types';
import { detectCurrentPhase } from './workflow';
import { filterCandidatesByPhase, isDevPhase } from './rules';
import { filterCandidatesByQuota, getCopilotQuota } from './quota';
import { filterCandidatesByRateLimit, getAllRateLimitStatuses, updateRateLimitFromHeaders } from './ratelimit';
import { mapProviderToOpenCode } from './model-mapping';
import { routeModel } from './router';

declare global {
  var __bmadRouterUpdateRateLimit: ((headers: Headers, provider: string) => void) | undefined;
}

globalThis.__bmadRouterUpdateRateLimit = updateRateLimitFromHeaders;

const DEFAULT_CANDIDATES: LLMProvider[] = [
  { provider: 'github-copilot', model: 'claude-sonnet-4' },
  { provider: 'github-copilot', model: 'gpt-4o' },
  { provider: 'github-copilot', model: 'gpt-4o-mini' },
];

const KEEP_MODEL_PATTERNS = [/^!km\b/i, /^!keep-model\b/i];

function shouldKeepModel(text: string): { keep: boolean; cleanedText: string } {
  for (const pattern of KEEP_MODEL_PATTERNS) {
    if (pattern.test(text)) {
      return { 
        keep: true, 
        cleanedText: text.replace(pattern, '').trimStart() 
      };
    }
  }
  return { keep: false, cleanedText: text };
}

function getTextFromParts(parts: Array<{ type: string; text?: string }>): string | null {
  const textPart = parts.find(p => p.type === 'text' && p.text);
  return textPart?.type === 'text' ? (textPart as { type: 'text'; text: string }).text : null;
}

function buildRouteReason(
  phase: BmadPhase, 
  selected: LLMProvider, 
  copilotFiltered: boolean,
  rateLimitedProviders: string[]
): string {
  const reasons: string[] = [];
  
  if (!isDevPhase(phase)) {
    reasons.push(`non-dev phase (${phase})`);
  }
  
  if (copilotFiltered) {
    reasons.push('copilot quota low');
  }
  
  if (rateLimitedProviders.length > 0) {
    reasons.push(`rate limited: ${rateLimitedProviders.join(', ')}`);
  }
  
  reasons.push(`selected: ${selected.provider}/${selected.model}`);
  
  return reasons.join(', ');
}

export const BmadRouterPlugin: Plugin = async ({ client, directory }: PluginInput) => {
  const hooks: Hooks = {
    'chat.message': async (input, output) => {
      const textPart = output.parts.find(p => p.type === 'text');
      if (textPart?.type === 'text') {
        const { keep, cleanedText } = shouldKeepModel(textPart.text);
        if (keep) {
          textPart.text = cleanedText;
          return;
        }
      }

      const phase = await detectCurrentPhase(directory);
      
      let candidates = filterCandidatesByPhase(DEFAULT_CANDIDATES, phase);
      
      const candidatesBeforeQuota = candidates.length;
      candidates = await filterCandidatesByQuota(candidates);
      const copilotFiltered = candidates.length < candidatesBeforeQuota;
      
      const { filtered: rateLimitFiltered, limitedProviders } = filterCandidatesByRateLimit(candidates);
      candidates = rateLimitFiltered;
      
      if (candidates.length === 0) {
        return;
      }

      const selected = await routeModel(candidates, output.parts);

      // Map NotDiamond model name back to OpenCode-compatible model
      const opencodeModel = mapProviderToOpenCode(selected);

      output.message.model = {
        providerID: opencodeModel.provider,
        modelID: opencodeModel.model,
      };

      const reason = buildRouteReason(phase, selected, copilotFiltered, limitedProviders);

      try {
        await client.event.publish({
          type: 'tui.toast.show',
          properties: {
            message: `Model: ${opencodeModel.provider}/${opencodeModel.model}`,
            variant: 'info',
            duration: 3000,
          },
        });
      } catch {
      }
    },

    tool: {
      bmad_route_info: tool({
        description: 'Show current BMAD routing status and recommendations',
        args: {},
        async execute() {
          const phase = await detectCurrentPhase(directory);
          const quota = await getCopilotQuota();
          const copilotAllowed = isDevPhase(phase);
          const rateLimits = getAllRateLimitStatuses();
          
          return JSON.stringify({
            phase,
            copilotAllowed,
            quota: quota ? {
              percentRemaining: Math.round(quota.percentRemaining),
              unlimited: quota.unlimited ?? false,
            } : null,
            rateLimits: Object.fromEntries(
              Object.entries(rateLimits).map(([k, v]) => [k, {
                percentRemaining: Math.round(v.percentRemaining),
                isLimited: v.isLimited,
                remainingRequests: v.remainingRequests,
              }])
            ),
            candidates: filterCandidatesByPhase(DEFAULT_CANDIDATES, phase),
          }, null, 2);
        },
      }),
    },
  };

  return hooks;
};

export default BmadRouterPlugin;
