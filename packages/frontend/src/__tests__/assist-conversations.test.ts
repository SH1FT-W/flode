import { describe, expect, it } from 'vitest';
import {
  addTurn,
  conversation,
  endRequest,
  isAsking,
  setConversation,
  startRequest,
  watchConversations,
} from '../assist-conversations';

describe('assistant conversations', () => {
  it('files an answer under the flow that asked, whichever tab is shown now', () => {
    setConversation('a', [{ role: 'user', text: 'Fehler?' }]);
    setConversation('b', [{ role: 'user', text: 'Hallo' }]);
    const turns = addTurn('a', { role: 'assistant', text: 'Keine.' });
    expect(turns.map((turn) => turn.text)).toEqual(['Fehler?', 'Keine.']);
    expect(conversation('a')).toBe(turns);
    expect(conversation('b').map((turn) => turn.text)).toEqual(['Hallo']);
    expect(conversation('c')).toEqual([]);
  });

  it('tracks a running request per flow', () => {
    expect(startRequest('a')).toBe(true);
    expect(startRequest('a')).toBe(false);
    expect(isAsking('a')).toBe(true);
    expect(isAsking('b')).toBe(false);
    endRequest('a');
    expect(isAsking('a')).toBe(false);
  });

  it('tells every open assistant when an answer arrives or a request ends', () => {
    let calls = 0;
    const unwatch = watchConversations(() => calls++);
    startRequest('d');
    addTurn('d', { role: 'assistant', text: 'Ok' });
    endRequest('d');
    unwatch();
    endRequest('d');
    expect(calls).toBe(2);
  });
});
