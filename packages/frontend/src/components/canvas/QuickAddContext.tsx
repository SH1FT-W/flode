import { createContext, useContext } from 'react';

/** A request to open the quick-add menu wired to an existing node handle. */
export interface QuickAddRequest {
  fromNodeId: string;
  fromHandleId: string | null;
  /** Screen point the menu anchors to (and the new node is placed right of). */
  screenX: number;
  screenY: number;
}

type OpenQuickAdd = (request: QuickAddRequest) => void;

const QuickAddContext = createContext<OpenQuickAdd | null>(null);

/**
 * Lets node cards (their "+" button) open FlowCanvas's quick-add menu without
 * prop-drilling through React Flow's node renderer. `null` outside a canvas.
 */
export const QuickAddProvider = QuickAddContext.Provider;

export function useOpenQuickAdd(): OpenQuickAdd | null {
  return useContext(QuickAddContext);
}
