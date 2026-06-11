import type { FlowNode } from '@flode/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { DeviceSelector } from '@/components/ui/DeviceSelector';
import { Input } from '@/components/ui/input';
import { getNodeDataString } from '@/utils/nodeData';

interface DeviceConditionFieldsProps {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
}

export function DeviceConditionFields({ node, onChange }: DeviceConditionFieldsProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const deviceId = getNodeDataString(node, 'device_id');
  const domain = getNodeDataString(node, 'domain');
  const type = getNodeDataString(node, 'type');

  return (
    <>
      <DeviceSelector
        value={deviceId}
        onChange={(val) => onChange('device_id', val)}
        label={t('common:labels.device')}
        required
        placeholder={t('common:placeholders.selectDevice')}
      />

      <FormField
        label={t('nodes:deviceCondition.domainLabel')}
        required
        description={t('nodes:deviceCondition.domainDescription')}
      >
        <Input
          type="text"
          value={domain}
          onChange={(e) => onChange('domain', e.target.value)}
          placeholder={t('nodes:deviceCondition.domainPlaceholder')}
        />
      </FormField>

      <FormField
        label={t('nodes:deviceCondition.typeLabel')}
        required
        description={t('nodes:deviceCondition.typeDescription')}
      >
        <Input
          type="text"
          value={type}
          onChange={(e) => onChange('type', e.target.value)}
          placeholder={t('nodes:deviceCondition.typePlaceholder')}
        />
      </FormField>
    </>
  );
}
