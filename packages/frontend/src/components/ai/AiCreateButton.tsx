import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAiTask } from '@/hooks/useAiTask';
import { useUiStore } from '@/store/ui-store';

interface AiCreateButtonProps {
  variant?: 'default' | 'outline';
}

/** "Create with AI" — only rendered when Home Assistant has an AI Task entity. */
export function AiCreateButton({ variant = 'outline' }: AiCreateButtonProps) {
  const { t } = useTranslation(['ui']);
  const { entityId, name } = useAiTask();
  if (!entityId) return null;

  return (
    <Button
      variant={variant}
      title={name ?? undefined}
      onClick={() => {
        const ui = useUiStore.getState();
        ui.runGuarded(() => ui.openDialog('aiFlow'));
      }}
    >
      <Sparkles />
      {t('ui:ai.flow.button')}
    </Button>
  );
}
