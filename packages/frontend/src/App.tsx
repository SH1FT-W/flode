import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import './index.css';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { AppDialogs } from '@/components/dialogs/AppDialogs';
import { AutomationHome } from '@/components/home/AutomationHome';
import { EditorHeader, HomeHeader } from '@/components/layout/AppHeader';
import { Inspector } from '@/components/layout/Inspector';
import { NodePalette } from '@/components/panels/NodePalette';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';
import { useAppRoot } from './contexts/AppRootContext';
import { useHass } from './contexts/HassContext';
import { useStartNewAutomation } from './hooks/useAppCommands';
import { useBackendTranslations } from './hooks/useBackendTranslations';
import { useDarkMode } from './hooks/useDarkMode';
import { useHaThemeSync } from './hooks/useHaThemeSync';
import { useIsolateTyping } from './hooks/useIsolateTyping';
import { useLanguage } from './hooks/useLanguage';
import { useLoadAutomation } from './hooks/useLoadAutomation';
import { useShortcuts } from './hooks/useShortcuts';
import { useUiStore } from './store/ui-store';

/**
 * Deep-link entry points — `/flode?automation=automation.xyz` opens that
 * automation, `/flode?new=1` starts blank; both skip the start screen. Query
 * params only (not HA's `route` property, which carries just prefix/path, no
 * search string). Rendered inside `<ReactFlowProvider>` because loading an
 * automation needs `useReactFlow`'s `fitView`. Waits for a real `hass` (needed
 * to resolve entity_id -> automation_id) and only ever runs once per mount.
 */
function DeepLinkHandler() {
  const { hass } = useHass();
  const loadAutomation = useLoadAutomation();
  const startNew = useStartNewAutomation();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !hass) return;

    const params = new URLSearchParams(window.location.search);
    const automationEntityId = params.get('automation');
    const isNew = params.get('new') === '1';
    if (!automationEntityId && !isNew) return;

    handled.current = true;

    if (automationEntityId) {
      const stateObj = hass.states[automationEntityId];
      const rawId = stateObj?.attributes?.id;
      const automationConfigId =
        typeof rawId === 'string' || typeof rawId === 'number'
          ? String(rawId)
          : automationEntityId.replace('automation.', '');
      useUiStore.getState().setView('editor');
      void loadAutomation({
        automation_id: automationConfigId,
        entity_id: automationEntityId,
        friendly_name:
          typeof stateObj?.attributes?.friendly_name === 'string'
            ? stateObj.attributes.friendly_name
            : undefined,
      });
    } else {
      startNew();
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('automation');
    url.searchParams.delete('new');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [hass, loadAutomation, startNew]);

  return null;
}

/** Registers global keyboard shortcuts (needs the ReactFlowProvider). */
function ShortcutHandler() {
  useShortcuts();
  return null;
}

function EditorView() {
  return (
    <>
      <EditorHeader />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <NodePalette />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <FlowCanvas />
        </main>
        <Inspector />
      </div>
    </>
  );
}

function HomeView() {
  return (
    <>
      <HomeHeader />
      <main className="min-h-0 flex-1">
        <AutomationHome />
      </main>
    </>
  );
}

function ErrorFallback({ error }: { error: unknown }) {
  const { t } = useTranslation(['common', 'dialogs']);
  const err = error instanceof Error ? error : new Error(String(error));
  const reloadApp = () => window.location.reload();
  return (
    <Dialog open={true} onOpenChange={reloadApp}>
      <DialogContent className="flex w-[90vw] max-w-full flex-col">
        <DialogHeader>
          <DialogTitle>{t('dialogs:error.title')}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{t('dialogs:error.description')}</DialogDescription>
        <div className="space-y-4">
          <pre className="max-h-60 overflow-auto rounded-xl bg-destructive/10 p-4 text-destructive text-sm">
            {err.message}
            <br />
            {err.stack}
          </pre>
          <div>{t('dialogs:error.refreshPrompt')}</div>
          <Button onClick={reloadApp}>{t('buttons.refresh')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function App() {
  const appRoot = useAppRoot();
  const { hass } = useHass();
  const view = useUiStore((s) => s.view);
  const isDark = useDarkMode();

  // Sync language with Home Assistant
  useLanguage();
  // Sync HA theme colors (custom theme + light/dark fallbacks, or FLODE's own override) onto our CSS vars
  useHaThemeSync();
  // HA's translated service names for plain-language node summaries
  useBackendTranslations();
  // Plain keys in FLODE (typing or on the canvas) must not trigger HA's single-key hotkeys
  useIsolateTyping();

  // Version guard: log which HA version we're running against, once — the
  // src/ha/ wrapper layer targets undocumented internal API that can change
  // between releases, so this is the first thing to check when a native
  // component mysteriously stops working.
  const loggedVersion = useRef(false);
  useEffect(() => {
    if (!loggedVersion.current && hass?.config?.version) {
      loggedVersion.current = true;
      logger.info(`Running against Home Assistant ${hass.config.version}`);
    }
  }, [hass]);

  useEffect(() => {
    appRoot?.classList.toggle('dark', isDark);
  }, [isDark, appRoot]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ReactFlowProvider>
        <DeepLinkHandler />
        <ShortcutHandler />
        <div className="flex h-screen flex-col bg-background">
          {view === 'home' ? <HomeView /> : <EditorView />}
        </div>
        <AppDialogs />
        <Toaster />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}

export default App;
