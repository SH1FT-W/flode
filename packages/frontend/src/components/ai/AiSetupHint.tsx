import { ExternalLink, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useHass } from '@/contexts/HassContext';
import { useAiTask } from '@/hooks/useAiTask';
import { navigateInHomeAssistant } from '@/lib/ha-navigate';
import { useHassStore } from '@/store/hass-store';
import { useUiStore } from '@/store/ui-store';

/** AI integrations that offer an AI Task, as HA integration domains. */
const PROVIDERS = [
  { domain: 'anthropic', label: 'Anthropic (Claude)' },
  { domain: 'openai_conversation', label: 'OpenAI (ChatGPT)' },
  { domain: 'google_generative_ai_conversation', label: 'Google Gemini' },
  { domain: 'ollama', label: 'Ollama' },
] as const;

/** HA's built-in, non-LLM conversation agent. */
const BUILT_IN_AGENT = 'conversation.home_assistant';

/** Friendly names of LLM chat agents (joined, so the selector stays stable). */
function selectChatAgents(
  states: Record<string, { attributes: Record<string, unknown> }> | undefined
): string {
  if (!states) return '';
  return Object.keys(states)
    .filter((id) => id.startsWith('conversation.') && id !== BUILT_IN_AGENT)
    .map((id) => {
      const name = states[id]?.attributes?.friendly_name;
      return typeof name === 'string' ? name : id;
    })
    .sort()
    .join(', ');
}

/**
 * Start-screen card for admins without an AI Task entity: how to set one up
 * so "Create with AI" and "Explain" appear. Users who already have an LLM
 * chat agent only need to add the AI Task service to that integration.
 */
export function AiSetupHint() {
  const { t } = useTranslation(['ui']);
  const { entityId, needsDefault } = useAiTask();
  const { isRemote, config } = useHass();
  const isAdmin = useHassStore((s) => s.hass?.user?.is_admin !== false);
  const hasHass = useHassStore((s) => s.hass !== undefined);
  const chatAgents = useHassStore((s) => selectChatAgents(s.hass?.states));
  const dismissed = useUiStore((s) => s.aiHintDismissed);
  const dismiss = useUiStore((s) => s.dismissAiHint);
  if (entityId || dismissed || !isAdmin || !hasHass) return null;

  const open = (path: string) => navigateInHomeAssistant(path, isRemote ? config.url : undefined);

  return (
    <section className="relative flex flex-col gap-3 rounded-2xl border border-primary/25 border-solid bg-primary/5 p-5 pr-12">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('ui:ai.setup.dismiss')}
        title={t('ui:ai.setup.dismiss')}
        className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-4" />
        </span>
        <h2 className="font-semibold text-base text-foreground">{t('ui:ai.setup.title')}</h2>
      </div>
      <p className="text-muted-foreground text-sm">{t('ui:ai.setup.intro')}</p>

      {needsDefault ? (
        <p className="text-foreground text-sm">{t('ui:ai.setup.defaultStep')}</p>
      ) : chatAgents ? (
        <ol className="list-decimal space-y-1 pl-5 text-foreground text-sm">
          <li>{t('ui:ai.setup.agentStep1', { agents: chatAgents })}</li>
          <li>{t('ui:ai.setup.agentStep2')}</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-foreground text-sm">
          <li>{t('ui:ai.setup.step1')}</li>
          <li>{t('ui:ai.setup.step2')}</li>
          <li>{t('ui:ai.setup.step3')}</li>
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {needsDefault ? null : chatAgents ? (
          <Button size="sm" onClick={() => open('/config/integrations/dashboard')}>
            <ExternalLink />
            {t('ui:ai.setup.openIntegrations')}
          </Button>
        ) : (
          PROVIDERS.map((provider) => (
            <Button
              key={provider.domain}
              size="sm"
              variant="outline"
              className="border-solid"
              onClick={() => open(`/config/integrations/dashboard/add?domain=${provider.domain}`)}
            >
              {provider.label}
            </Button>
          ))
        )}
        <Button
          size="sm"
          variant={needsDefault ? 'default' : 'ghost'}
          onClick={() => open('/config/ai-tasks')}
        >
          {t('ui:ai.setup.openDefault')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t('ui:ai.setup.privacy')}</p>
    </section>
  );
}
