import { describe, expect, it } from 'vitest';
import { type AiTaskChoice, chooseAiTask, keepAiTask } from '../ai-task';

const states = { 'ai_task.claude': { attributes: { supported_features: 1 } } };
const inUse: AiTaskChoice = { entityId: 'ai_task.claude', needsDefault: false };

describe('re-reading the AI Task', () => {
  it('marks a failed preferences read', async () => {
    const choice = await chooseAiTask(() => Promise.reject(new Error('lost')), states);
    expect(choice).toEqual({ entityId: null, needsDefault: true, failed: true });
  });

  it('keeps the AI Task in use through a short connection error', async () => {
    const failed = await chooseAiTask(() => Promise.reject(new Error('lost')), states);
    expect(keepAiTask(inUse, failed)).toBe(inUse);
  });

  it('follows real changes and a failure without a previous choice', async () => {
    const none: AiTaskChoice = { entityId: null, needsDefault: true };
    expect(keepAiTask(inUse, none)).toBe(none);
    const failed: AiTaskChoice = { ...none, failed: true };
    expect(keepAiTask({ entityId: null, needsDefault: false }, failed)).toBe(failed);
  });
});
