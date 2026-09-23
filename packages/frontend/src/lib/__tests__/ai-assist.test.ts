import { describe, expect, it } from 'vitest';
import {
  buildExplainInstructions,
  buildFlowInstructions,
  buildRepairInstructions,
  collectEntityIds,
  extractYaml,
  findUnknownEntityIds,
  promptKeywords,
  readableAiError,
  selectPromptEntities,
  suggestReplacements,
} from '../ai-assist';

const CANDIDATES = [
  { entity_id: 'light.flur', name: 'Flur Deckenlicht', area: 'Flur' },
  { entity_id: 'binary_sensor.haustur', name: 'Haustür', area: 'Flur' },
  { entity_id: 'light.kuche', name: 'Küche Licht', area: 'Küche' },
  { entity_id: 'person.daniel', name: 'Daniel' },
  { entity_id: 'sun.sun', name: 'Sonne' },
];

describe('promptKeywords', () => {
  it('drops short and filler words', () => {
    expect(promptKeywords('Wenn die Haustür aufgeht, dann Flur an')).toEqual([
      'haustür',
      'aufgeht',
      'flur',
    ]);
  });
});

describe('selectPromptEntities', () => {
  it('ranks keyword matches first, then people/sun, then fills with common domains', () => {
    const picked = selectPromptEntities('Haustür öffnet → Flurlicht an', CANDIDATES);
    expect(picked.map((e) => e.entity_id)).toEqual([
      'binary_sensor.haustur',
      'light.flur',
      'person.daniel',
      'sun.sun',
      'light.kuche',
    ]);
  });

  it('respects the limit', () => {
    expect(selectPromptEntities('Flur', CANDIDATES, 1)).toHaveLength(1);
  });
});

describe('buildFlowInstructions', () => {
  it('lists the entities and the request', () => {
    const text = buildFlowInstructions({
      description: 'Flurlicht an',
      entities: [CANDIDATES[0]],
      language: 'de',
    });
    expect(text).toContain('- light.flur | Flur Deckenlicht | Flur');
    expect(text).toContain('Flurlicht an');
    expect(text).toContain('language: de');
  });

  it('asks for a script config with fields when building a script', () => {
    const text = buildFlowInstructions({
      description: 'Flurlicht mit wählbarer Helligkeit',
      entities: [CANDIDATES[0]],
      language: 'de',
      kind: 'script',
    });
    expect(text).toContain('Home Assistant scripts');
    expect(text).toContain('sequence');
    expect(text).toContain('fields:');
    expect(text).not.toContain('triggers, conditions, actions');
  });
});

describe('buildExplainInstructions', () => {
  it('includes outcome, error and truncates huge traces', () => {
    const text = buildExplainInstructions({
      config: { alias: 'Test' },
      trace: { 'action/0': 'x'.repeat(30_000) },
      outcome: 'error',
      error: 'Boom',
      language: 'de',
      timeZone: 'Europe/Berlin',
    });
    expect(text).toContain('Outcome: error — error: Boom');
    expect(text).toContain('local time zone (Europe/Berlin)');
    expect(text).toContain('… (truncated)');
  });
});

describe('extractYaml', () => {
  it('unwraps a fenced reply', () => {
    expect(extractYaml('Here you go:\n```yaml\nalias: A\n```\nEnjoy')).toBe('alias: A');
  });

  it('keeps a plain reply', () => {
    expect(extractYaml('  alias: A\n')).toBe('alias: A');
  });
});

describe('entity id checks', () => {
  const config = {
    triggers: [{ trigger: 'state', entity_id: 'binary_sensor.haustur' }],
    actions: [
      { action: 'light.turn_on', target: { entity_id: ['light.flur', 'light.erfunden'] } },
      { action: 'notify.mobile', data: { entity_id: '{{ trigger.entity_id }}' } },
    ],
  };

  it('collects string and list values, skipping templates', () => {
    expect([...collectEntityIds(config)].sort()).toEqual([
      'binary_sensor.haustur',
      'light.erfunden',
      'light.flur',
    ]);
  });

  it('reports ids that do not exist', () => {
    const known = new Set(['binary_sensor.haustur', 'light.flur']);
    expect(findUnknownEntityIds(config, known)).toEqual(['light.erfunden']);
  });
});

describe('readableAiError', () => {
  it('pulls the innermost message out of a provider dump', () => {
    const dump =
      "Anthropic API error: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low.'}, 'request_id': 'req_1'}";
    expect(readableAiError(dump)).toBe('Your credit balance is too low.');
  });

  it('keeps plain messages', () => {
    expect(readableAiError('Timeout')).toBe('Timeout');
  });
});

describe('suggestReplacements', () => {
  it('offers same-domain entities, best match first', () => {
    const picked = suggestReplacements(['light.kuche_lampe'], CANDIDATES);
    expect(picked.map((e) => e.entity_id)).toEqual(['light.kuche', 'light.flur']);
  });
});

describe('buildRepairInstructions', () => {
  it('lists problems, suggestions and the previous reply', () => {
    const text = buildRepairInstructions({
      instructions: 'ORIGINAL',
      reply: 'alias: X',
      problems: ['Entity light.x does not exist'],
      suggestions: [CANDIDATES[0]],
    });
    expect(text).toContain('ORIGINAL');
    expect(text).toContain('- Entity light.x does not exist');
    expect(text).toContain('- light.flur | Flur Deckenlicht | Flur');
    expect(text).toContain('Previous reply:\nalias: X');
  });
});
