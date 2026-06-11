import type { NodeValidationError } from '@flode/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFlowStore } from '@/store/flow-store';

/**
 * Hook to get validation errors for a specific node.
 * Used by node components to display error indicators on the canvas.
 */
export function useNodeErrors(nodeId: string): {
  hasErrors: boolean;
  errors: NodeValidationError[];
  errorMessages: string[];
  getFieldError: (fieldPath: string) => string | undefined;
  getRootError: () => string | undefined;
} {
  const { t } = useTranslation();
  const errors = useFlowStore((s) => s.nodeErrors.get(nodeId));

  const result = useMemo(() => {
    const errorList = errors ?? [];

    // Translate a message — messages from validation.ts are i18n keys like
    // 'errors:validation.trigger.entityRequired.state'. If the key exists in
    // the current language it is translated; otherwise the key itself is shown.
    const translateMessage = (message: string): string => t(message, { defaultValue: message });

    const getFieldError = (fieldPath: string): string | undefined => {
      const fieldError = errorList.find((e) => e.path.includes(fieldPath));
      return fieldError ? translateMessage(fieldError.message) : undefined;
    };

    const getRootError = (): string | undefined => {
      const rootError = errorList.find((e) => e.path.includes('_root') || e.path.length === 0);
      return rootError ? translateMessage(rootError.message) : undefined;
    };

    return {
      hasErrors: errorList.length > 0,
      errors: errorList,
      errorMessages: errorList.map((e) => translateMessage(e.message)),
      getFieldError,
      getRootError,
    };
  }, [errors, t]);

  return result;
}

/**
 * Hook to get all validation errors across all nodes.
 * Used by save dialogs and other components that need a global view.
 */
export function useAllNodeErrors(): {
  hasErrors: boolean;
  errorCount: number;
  nodeErrors: Map<string, NodeValidationError[]>;
} {
  const nodeErrors = useFlowStore((s) => s.nodeErrors);

  return {
    hasErrors: nodeErrors.size > 0,
    errorCount: nodeErrors.size,
    nodeErrors,
  };
}
