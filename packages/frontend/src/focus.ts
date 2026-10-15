/** Something with a `focus()` — an input, or HA's code editor's CodeMirror view. */
function canFocus(value: unknown): value is { focus: () => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'focus' in value &&
    typeof value.focus === 'function'
  );
}

const FIELDS = 'ha-code-editor, input, textarea, ha-textarea, ha-textfield, ha-input';

/**
 * Puts the keyboard into a dialog's first field — call it when the dialog
 * opens. HA's dialog animates in and its code editor loads CodeMirror first,
 * so it tries again until the field has the focus (for up to ~2 s). Typing
 * then goes into the field instead of triggering HA's single-key shortcuts.
 */
export function focusFirstField(root: ParentNode, tries = 20): void {
  window.setTimeout(() => {
    const field = root.querySelector(FIELDS);
    // HA's code editor keeps its CodeMirror view as `codemirror` (there once loaded).
    const target = field?.localName === 'ha-code-editor' ? Reflect.get(field, 'codemirror') : field;
    if (canFocus(target)) target.focus();
    // Not there yet, or the dialog took the focus back while animating in: once more.
    if (!field?.matches(':focus-within') && tries > 0) focusFirstField(root, tries - 1);
  }, 80);
}
