import { AlertTriangle, Check, Copy, Loader2, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useHass } from '@/contexts/HassContext';
import { HaAreaPicker, HaCategoryPicker, HaIconPicker, HaLabelsPicker } from '@/ha';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { useFlowStore } from '@/store/flow-store';

interface RegistryMetadata {
  icon: string;
  category: string;
  labels: string[];
  area: string;
}

const EMPTY_METADATA: RegistryMetadata = { icon: '', category: '', labels: [], area: '' };

interface CategoryFallbackProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Fallback for `HaCategoryPicker` when `ha-category-picker` isn't registered
 * — unlike every other native component FLODE wraps, HA never loads this one
 * as a side effect of anything FLODE itself renders (no lovelace card or
 * `ha-selector` type pulls it in — see haComponentLoader.ts). Talks to the
 * category registry directly: type a name, an existing category is matched
 * by name or a new one is created on blur. Styled to match HA's own filled
 * text field (label inside a shaded box) so it doesn't stick out next to the
 * real native pickers around it.
 */
function CategoryFallback({ label, value, onChange, disabled }: CategoryFallbackProps) {
  const { t } = useTranslation(['dialogs']);
  const { hass } = useHass();
  const [categories, setCategories] = useState<{ category_id: string; name: string }[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!hass) return;
    getHomeAssistantAPI(hass).getCategories('automation').then(setCategories);
  }, [hass]);

  useEffect(() => {
    setText(categories.find((c) => c.category_id === value)?.name ?? '');
  }, [value, categories]);

  const commit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      onChange(existing.category_id);
      return;
    }
    if (!hass) return;
    const created = await getHomeAssistantAPI(hass).createCategory('automation', trimmed);
    setCategories((prev) => [...prev, created]);
    onChange(created.category_id);
  };

  return (
    <div className="rounded-t-md border-input border-b bg-secondary px-3 pt-1.5 pb-1">
      <span className="block text-muted-foreground text-xs">{label}</span>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={t('dialogs:save.categoryPlaceholder')}
        disabled={disabled}
        list="flode-category-options"
        className="h-auto rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
      <datalist id="flode-category-options">
        {categories.map((c) => (
          <option key={c.category_id} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

interface AutomationSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (automationId: string) => void;
}

export function AutomationSaveDialog({ isOpen, onClose, onSaved }: AutomationSaveDialogProps) {
  const { t } = useTranslation(['common', 'dialogs', 'errors']);
  const {
    flowName,
    flowDescription,
    automationId,
    isSaving,
    setFlowName,
    setFlowDescription,
    setAutomationId,
    saveAutomation,
    updateAutomation,
  } = useFlowStore();

  const { hass } = useHass();

  const [localDescription, setLocalDescription] = useState(flowDescription);
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<RegistryMetadata>(EMPTY_METADATA);
  const touchedFields = useRef<Set<keyof RegistryMetadata>>(new Set());

  const isUpdate = !!automationId;

  const setMetadataField = <K extends keyof RegistryMetadata>(
    field: K,
    value: RegistryMetadata[K]
  ) => {
    touchedFields.current.add(field);
    setMetadata((prev) => ({ ...prev, [field]: value }));
  };

  // Sync local description with store when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalDescription(flowDescription);
      setError(null);
      setSuggestedName(null);
      touchedFields.current = new Set();

      if (isUpdate && automationId && hass) {
        const api = getHomeAssistantAPI(hass);
        const entityId = api.findAutomationEntityId(automationId);
        if (entityId) {
          api.getEntityRegistryEntry(entityId).then((entry) => {
            if (!entry) return;
            setMetadata((prev) => ({
              icon: touchedFields.current.has('icon') ? prev.icon : entry.icon || '',
              category: touchedFields.current.has('category')
                ? prev.category
                : entry.categories?.automation || '',
              labels: touchedFields.current.has('labels') ? prev.labels : entry.labels || [],
              area: touchedFields.current.has('area') ? prev.area : entry.area_id || '',
            }));
          });
        }
      } else {
        setMetadata(EMPTY_METADATA);
      }
    }
  }, [isOpen, automationId, hass, flowDescription, isUpdate]);

  // Check for name conflicts when name changes
  const checkNameConflict = async (name: string) => {
    if (!name.trim()) {
      setSuggestedName(null);
      return;
    }

    try {
      const exists = await getHomeAssistantAPI(hass).automationExistsByAlias(name);
      if (exists && !isUpdate) {
        const uniqueName = await getHomeAssistantAPI(hass).getUniqueAutomationAlias(name);
        setSuggestedName(uniqueName);
      } else {
        setSuggestedName(null);
      }
    } catch (err) {
      console.warn('Failed to check name conflict:', err);
      setSuggestedName(null);
    }
  };

  // Registry metadata is a nice-to-have on top of the automation itself — a
  // failure here shouldn't surface as a save failure the user has to retry.
  // Returns the resolved entity_id (if any) so the caller can also fire the
  // `flode_automation_saved` bus event against it.
  const applyRegistryMetadata = async (
    resultId: string,
    isNewAutomation: boolean
  ): Promise<string | undefined> => {
    if (!hass) return undefined;
    const api = getHomeAssistantAPI(hass);
    try {
      const entityId = isNewAutomation
        ? await api.waitForAutomationEntity(resultId)
        : api.findAutomationEntityId(resultId);
      if (!entityId) return undefined;

      await api.updateEntityRegistryEntry(entityId, {
        icon: metadata.icon || null,
        area_id: metadata.area || null,
        labels: metadata.labels,
        categories: { automation: metadata.category || null },
      });
      return entityId;
    } catch (err) {
      console.warn('Failed to apply registry metadata:', err);
      return undefined;
    }
  };

  // Lets other automations/scripts react to FLODE saves. Best-effort, same
  // as the registry metadata above — never blocks or fails the save itself.
  const notifyAutomationSaved = async (entityId: string | undefined) => {
    if (!hass || !entityId) return;
    try {
      await getHomeAssistantAPI(hass).fireBusEvent('flode_automation_saved', {
        entity_id: entityId,
      });
    } catch (err) {
      console.warn('Failed to fire flode_automation_saved event:', err);
    }
  };

  const handleSave = async () => {
    if (!hass) {
      setError(t('errors:connection.notConnected'));
      return;
    }

    if (!flowName.trim()) {
      setError(t('errors:form.nameRequired'));
      return;
    }

    setError(null);

    try {
      // Update the flow store with the description
      setFlowDescription(localDescription.trim());

      let resultId: string;
      if (isUpdate) {
        await updateAutomation(hass);
        resultId = automationId || '';
      } else {
        resultId = await saveAutomation(hass);
      }

      const entityId = await applyRegistryMetadata(resultId, !isUpdate);
      await notifyAutomationSaved(entityId);

      onSaved?.(resultId);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errors:api.unknownError');
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuggestedName(null);
    onClose();
  };

  const handleNameChange = (name: string) => {
    setFlowName(name);
    checkNameConflict(name);
  };

  const useSuggestedName = () => {
    if (suggestedName) {
      setFlowName(suggestedName);
      setSuggestedName(null);
    }
  };

  const handleSaveAsCopy = async () => {
    if (!hass) {
      setError(t('errors:connection.notConnected'));
      return;
    }

    setError(null);

    try {
      // Get a unique name for the copy
      const copyName = await getHomeAssistantAPI(hass).getUniqueAutomationAlias(flowName);
      setFlowName(copyName);
      setFlowDescription(localDescription.trim());

      // Clear the automation ID to force creating a new one
      setAutomationId(null);

      // Save as new automation
      const resultId = await saveAutomation(hass);

      const entityId = await applyRegistryMetadata(resultId, true);
      await notifyAutomationSaved(entityId);

      onSaved?.(resultId);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errors:api.unknownError');
      setError(errorMessage);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            {isUpdate ? t('dialogs:save.titleUpdate') : t('dialogs:save.title')}
          </DialogTitle>
          <DialogDescription>
            {isUpdate ? t('dialogs:save.descriptionUpdate') : t('dialogs:save.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="automation-name">{t('dialogs:save.nameLabel')}</Label>
            <Input
              id="automation-name"
              value={flowName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t('placeholders.enterAutomationName')}
              disabled={isSaving}
            />
          </div>

          {suggestedName && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{t('dialogs:save.nameConflict', { suggestedName })}</span>
                <Button variant="outline" size="sm" onClick={useSuggestedName} disabled={isSaving}>
                  {t('buttons.use')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="automation-description">{t('dialogs:save.descriptionLabel')}</Label>
            <Textarea
              id="automation-description"
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              placeholder={t('placeholders.describeAutomation')}
              rows={3}
              disabled={isSaving}
            />
          </div>

          <HaIconPicker
            label={t('dialogs:save.iconLabel')}
            value={metadata.icon}
            onChange={(value) => setMetadataField('icon', value)}
            disabled={isSaving}
          />

          <HaCategoryPicker
            label={t('dialogs:save.categoryLabel')}
            scope="automation"
            value={metadata.category}
            onChange={(value) => setMetadataField('category', value)}
            disabled={isSaving}
            fallback={
              <CategoryFallback
                label={t('dialogs:save.categoryLabel')}
                value={metadata.category}
                onChange={(value) => setMetadataField('category', value)}
                disabled={isSaving}
              />
            }
          />

          <HaLabelsPicker
            label={t('dialogs:save.labelsLabel')}
            value={metadata.labels}
            onChange={(value) => setMetadataField('labels', value)}
            disabled={isSaving}
          />

          <HaAreaPicker
            label={t('dialogs:save.areaLabel')}
            value={metadata.area}
            onChange={(value) => setMetadataField('area', value)}
            disabled={isSaving}
          />

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>
              {t('buttons.cancel')}
            </Button>
            {isUpdate && (
              <Button
                variant="outline"
                onClick={handleSaveAsCopy}
                disabled={isSaving || !flowName.trim()}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {t('buttons.saveAsCopy')}
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving || !flowName.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isUpdate ? t('status.updating') : t('status.saving')}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {isUpdate ? t('buttons.update') : t('buttons.save')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
