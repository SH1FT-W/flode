import type { MergeWarning } from '@flode/ui-core';
import { t } from './strings';
import type { ImportWarningsHeading } from './tabs';

/** What merging changed, in words — one line per `MergeWarning` (`mergeAutomations`). */
export function mergeWarningText(language: string, warning: MergeWarning): string {
  if (warning.kind === 'modeChanged') {
    return t(language, 'mergeWarnMode')
      .replace('{modes}', warning.modes.join(', '))
      .replace('{mode}', warning.mode);
  }
  return t(
    language,
    warning.kind === 'variableCheck' ? 'mergeWarnVariableCheck' : 'mergeWarnVariable'
  )
    .replace('{name}', warning.name)
    .replace('{source}', warning.source)
    .replace('{renamed}', warning.renamed);
}

/**
 * The banner's heading for merge warnings — "please check" only when a template
 * couldn't be adapted safely, otherwise a plain note on what merging changed.
 */
export function mergeWarningsHeading(warnings: readonly MergeWarning[]): ImportWarningsHeading {
  return warnings.some((warning) => warning.kind === 'variableCheck')
    ? { title: 'mergeWarnCheckTitle', text: 'mergeWarnCheckText' }
    : { title: 'mergeWarnInfoTitle', text: 'mergeWarnInfoText' };
}
