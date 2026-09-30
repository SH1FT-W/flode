import type { FlowGraph } from '@flode/shared';
import type { AssistTurn } from '@flode/ui-core';
import { InFlight } from './in-flight';

export interface Proposal {
  graph?: FlowGraph;
  /** Why it can't be applied as is (unparseable YAML, unknown entities …). */
  problems: string[];
}

export interface ChatTurn extends AssistTurn {
  proposal?: Proposal;
  applied?: boolean;
}

/** One conversation per open flow (by graph id), kept while the page lives. */
const conversations = new Map<string, ChatTurn[]>();
/** Flows with a question still waiting for its answer. */
const asking = new InFlight();
/** Open assistants — an answer can arrive after the user moved to another tab and back. */
const watchers = new Set<() => void>();

function changed(): void {
  for (const watcher of watchers) watcher();
}

/** Calls `watcher` whenever an answer arrived or a request ended; returns the unsubscribe. */
export function watchConversations(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

export function conversation(graphId: string): ChatTurn[] {
  return conversations.get(graphId) ?? [];
}

export function setConversation(graphId: string, turns: ChatTurn[]): void {
  conversations.set(graphId, turns);
}

/** Adds to the conversation of the flow that asked — not necessarily the one shown now. */
export function addTurn(graphId: string, turn: ChatTurn): ChatTurn[] {
  const turns = [...conversation(graphId), turn];
  setConversation(graphId, turns);
  changed();
  return turns;
}

/** `false` when this flow is already waiting for an answer. */
export function startRequest(graphId: string): boolean {
  return asking.start(graphId);
}

export function endRequest(graphId: string): void {
  asking.end(graphId);
  changed();
}

export function isAsking(graphId: string): boolean {
  return asking.has(graphId);
}
