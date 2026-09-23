import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlowStore } from '../flow-store';
import { useUiStore } from '../ui-store';

describe('ui-store runGuarded', () => {
  beforeEach(() => {
    useUiStore.setState({ dialog: null, pendingDiscard: null, view: 'home' });
    vi.restoreAllMocks();
  });

  it('runs the action immediately without unsaved changes', () => {
    vi.spyOn(useFlowStore.getState(), 'hasRealChanges').mockReturnValue(false);
    const action = vi.fn();
    useUiStore.getState().runGuarded(action);
    expect(action).toHaveBeenCalledOnce();
    expect(useUiStore.getState().dialog).toBeNull();
  });

  it('asks first when there are unsaved changes, and runs on confirm', () => {
    vi.spyOn(useFlowStore.getState(), 'hasRealChanges').mockReturnValue(true);
    const action = vi.fn();
    useUiStore.getState().runGuarded(action);
    expect(action).not.toHaveBeenCalled();
    expect(useUiStore.getState().dialog).toBe('discard');

    useUiStore.getState().confirmDiscard();
    expect(action).toHaveBeenCalledOnce();
    expect(useUiStore.getState().dialog).toBeNull();
  });

  it('dropping the dialog discards the pending action', () => {
    vi.spyOn(useFlowStore.getState(), 'hasRealChanges').mockReturnValue(true);
    const action = vi.fn();
    useUiStore.getState().runGuarded(action);
    useUiStore.getState().closeDialog();
    useUiStore.getState().confirmDiscard();
    expect(action).not.toHaveBeenCalled();
  });
});
