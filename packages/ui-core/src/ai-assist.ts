/**
 * Prompt building and response handling for FLODE's AI assist, which runs on
 * Home Assistant's own `ai_task.generate_data` — the LLM the user configured
 * in HA (OpenAI, Anthropic, Google, Ollama …). FLODE never talks to an AI
 * provider itself and never saves what the model returns: results land on
 * the canvas as a draft the user reviews.
 */

/** One entity the model may use, as offered in the prompt. */
export interface AiEntityCandidate {
  entity_id: string;
  name: string;
  area?: string;
}

/** Upper bound for entities in one prompt — keeps requests small on big installs. */
export const MAX_PROMPT_ENTITIES = 150;

/**
 * Domains automations typically use, most useful first. After the keyword
 * matches, the prompt is filled up with these — names don't always share a
 * language with the request ("Garten" vs. "Movement Backyard").
 */
const FILL_DOMAINS = [
  'light',
  'switch',
  'binary_sensor',
  'cover',
  'lock',
  'climate',
  'fan',
  'media_player',
  'notify',
  'input_boolean',
  'scene',
  'script',
  'vacuum',
  'alarm_control_panel',
  'sensor',
];

/** Domains that describe people/presence/sun — handy context for almost any automation. */
const ALWAYS_OFFERED_DOMAINS = new Set(['person', 'sun', 'zone']);

const STOP_WORDS = new Set([
  'the',
  'and',
  'when',
  'then',
  'with',
  'for',
  'from',
  'into',
  'after',
  'wenn',
  'dann',
  'und',
  'oder',
  'mit',
  'für',
  'auf',
  'nach',
  'bei',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'ein',
  'eine',
  'einen',
  'ist',
  'wird',
]);

/** Lower-case words of at least 3 letters, without common filler words. */
export function promptKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return [...new Set(words)];
}

function relevance(candidate: AiEntityCandidate, keywords: readonly string[]): number {
  const haystack = `${candidate.entity_id} ${candidate.name} ${candidate.area ?? ''}`.toLowerCase();
  return keywords.reduce((score, keyword) => {
    if (haystack.includes(keyword)) return score + 2;
    // "Flurlicht" should still find "Flur": compare word stems of 4+ letters.
    if (keyword.length >= 5 && haystack.includes(keyword.slice(0, 4))) return score + 1;
    return score;
  }, 0);
}

/**
 * Picks the entities worth showing the model for `description`: the best
 * keyword matches (name, id, area) and people/sun/zones first, then other
 * entities of common automation domains, capped at `limit`. Sending all of a
 * large install's entities would be slow and expensive.
 */
export function selectPromptEntities(
  description: string,
  candidates: readonly AiEntityCandidate[],
  limit = MAX_PROMPT_ENTITIES
): AiEntityCandidate[] {
  const keywords = promptKeywords(description);
  const always = candidates.filter((c) => ALWAYS_OFFERED_DOMAINS.has(c.entity_id.split('.')[0]));
  const ranked = candidates
    .map((candidate) => ({ candidate, score: relevance(candidate, keywords) }))
    .filter(({ candidate, score }) => score > 0 && !always.includes(candidate))
    .sort((a, b) => b.score - a.score || a.candidate.entity_id.localeCompare(b.candidate.entity_id))
    .map(({ candidate }) => candidate);
  const picked = new Set([...ranked, ...always]);
  const fill = FILL_DOMAINS.flatMap((domain) =>
    candidates.filter((c) => !picked.has(c) && c.entity_id.startsWith(`${domain}.`))
  );
  return [...ranked, ...always, ...fill].slice(0, limit);
}

/**
 * Replacement candidates for entity ids the model invented: entities of the
 * same domain, best keyword matches (from the invented id) first.
 */
export function suggestReplacements(
  unknownIds: readonly string[],
  candidates: readonly AiEntityCandidate[],
  perId = 25
): AiEntityCandidate[] {
  const suggestions = new Set<AiEntityCandidate>();
  for (const id of unknownIds) {
    const [domain, objectId = ''] = id.split('.');
    const keywords = promptKeywords(objectId.replace(/_/g, ' '));
    candidates
      .filter((c) => c.entity_id.startsWith(`${domain}.`))
      .map((candidate) => ({ candidate, score: relevance(candidate, keywords) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, perId)
      .forEach(({ candidate }) => {
        suggestions.add(candidate);
      });
  }
  return [...suggestions];
}

function entityLines(entities: readonly AiEntityCandidate[]): string {
  return entities
    .map((e) => `- ${e.entity_id} | ${e.name}${e.area ? ` | ${e.area}` : ''}`)
    .join('\n');
}

/** What the AI builds — an automation or a script (see `@flode/shared`'s script.ts). */
export type AiFlowKind = 'automation' | 'script';

export interface FlowPromptInput {
  description: string;
  entities: readonly AiEntityCandidate[];
  /** UI language, e.g. "de" — used for alias/description. */
  language: string;
  kind?: AiFlowKind;
}

/** Shape of the reply, per kind. */
const KIND_RULES: Record<AiFlowKind, readonly string[]> = {
  automation: [
    'You write Home Assistant automations. Reply with ONE automation as YAML and nothing else — no explanations, no Markdown fences.',
    'Use the current syntax: top-level keys alias, description, mode, triggers, conditions, actions; `trigger:` inside each trigger, `condition:` inside each condition, `action:` for service calls with `target:` and `data:`.',
  ],
  script: [
    'You write Home Assistant scripts. Reply with ONE script config as YAML and nothing else — no explanations, no Markdown fences, no script id wrapper.',
    'Top-level keys: alias, description, mode, fields (optional), sequence. A script has NO triggers. Put conditions that should stop the script as condition steps into `sequence`.',
    'If the request needs values chosen at start (brightness, duration, a target …), declare them under `fields:` as `<variable>: {name: …, description: …, required: true|false, default: …, selector: {…}}` using Home Assistant selectors (number, boolean, text, entity, select, duration, time …) and use them in templates, e.g. `{{ brightness }}`.',
    'Service calls use `action:` with `target:` and `data:`.',
  ],
};

/** Instructions for turning a plain-language description into automation or script YAML. */
export function buildFlowInstructions({
  description,
  entities,
  language,
  kind = 'automation',
}: FlowPromptInput): string {
  return [
    ...KIND_RULES[kind],
    'Step syntax: wait a fixed time with `- delay: "00:05:00"` (never `action: delay`); branch with `- if: [...] then: [...] else: [...]`; wait with `wait_for_trigger` / `wait_template`; notify with `action: notify.<service>` and `data: {message: ...}`.',
    `Only use entity ids from the list below. If the request needs a device that is not listed, pick the closest listed one and mention the assumption in the ${kind} description.`,
    `Write alias and description in this language: ${language}.`,
    '',
    'Available entities (entity_id | name | area):',
    entityLines(entities) || '- (none matched — use generic triggers such as time or sun)',
    '',
    'Request:',
    description.trim(),
  ].join('\n');
}

export interface RepairPromptInput {
  /** The original instructions (request + entity list). */
  instructions: string;
  /** The model's previous reply. */
  reply: string;
  /** What was wrong with it (parser errors, validation errors, unknown ids). */
  problems: readonly string[];
  /** Real entities that could replace invented ones. */
  suggestions: readonly AiEntityCandidate[];
}

/** Instructions for one correction round after a reply didn't hold up. */
export function buildRepairInstructions({
  instructions,
  reply,
  problems,
  suggestions,
}: RepairPromptInput): string {
  return [
    instructions,
    '',
    'Your previous reply had these problems:',
    ...problems.map((problem) => `- ${problem}`),
    ...(suggestions.length > 0
      ? ['', 'Real entities to use instead (entity_id | name | area):', entityLines(suggestions)]
      : []),
    '',
    'Previous reply:',
    reply,
    '',
    'Reply again with only the corrected YAML.',
  ].join('\n');
}

/** Keeps a prompt payload below `maxChars` so huge traces don't blow the request up. */
function clip(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n… (truncated)`;
}

export interface ExplainPromptInput {
  /** The automation config the run used (`trace/get` → `config`). */
  config: unknown;
  /** The run's steps (`trace/get` → `trace`). */
  trace: unknown;
  /** How the run ended (`script_execution`) and its error, if any. */
  outcome: string;
  error?: string;
  language: string;
  /** The home's IANA time zone — trace timestamps are UTC. */
  timeZone?: string;
}

/** Instructions for explaining one real run of an automation. */
export function buildExplainInstructions({
  config,
  trace,
  outcome,
  error,
  language,
  timeZone,
}: ExplainPromptInput): string {
  return [
    `Explain in ${language}, in plain words for a non-programmer, what happened in this Home Assistant automation run and why.`,
    'Start with one short sentence that answers "did it do its job, and if not, why not?". Then list the relevant steps briefly (what triggered it, which condition passed or failed with the actual values, which actions ran). If something failed, end with one concrete suggestion. At most 120 words, no Markdown headings, no code blocks.',
    timeZone
      ? `Trace timestamps are UTC; state every time in the home's local time zone (${timeZone}).`
      : 'Trace timestamps are UTC.',
    '',
    `Outcome: ${outcome}${error ? ` — error: ${error}` : ''}`,
    '',
    'Automation config:',
    clip(JSON.stringify(config, null, 1), 12_000),
    '',
    'Trace (step path → recorded result):',
    clip(JSON.stringify(trace, null, 1), 20_000),
  ].join('\n');
}

/** The YAML in a model reply — tolerates Markdown fences and chatter around them. */
export function extractYaml(reply: string): string {
  const fenced = reply.match(/```(?:ya?ml)?[ \t]*\r?\n([\s\S]*?)```/i);
  return (fenced ? fenced[1] : reply).trim();
}

const ENTITY_ID_PATTERN = /^[a-z_]+\.[a-z0-9_]+$/;

/** Every `entity_id` value (string or list) anywhere inside `value`. */
export function collectEntityIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectEntityIds(item, found);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'entity_id') {
        const ids = Array.isArray(child) ? child : [child];
        for (const id of ids) {
          if (typeof id === 'string' && ENTITY_ID_PATTERN.test(id)) found.add(id);
        }
      } else {
        collectEntityIds(child, found);
      }
    }
  }
  return found;
}

/** Entity ids the model used that don't exist in this Home Assistant. */
export function findUnknownEntityIds(value: unknown, knownIds: ReadonlySet<string>): string[] {
  return [...collectEntityIds(value)].filter((id) => !knownIds.has(id)).sort();
}

/**
 * Provider errors arrive as long dumps ("Anthropic API error: Error code: 400
 * - {'type': 'error', 'error': {… 'message': 'Your credit balance is too
 * low …'}}"). Returns the innermost human-readable `message`, else the input.
 */
export function readableAiError(message: string): string {
  const matches = [...message.matchAll(/['"]message['"]:\s*['"]([^'"]{8,})['"]/g)];
  return matches.at(-1)?.[1] ?? message;
}

// ---- assistant for the open flow: questions, error hunting, optimizing -------------

export interface AssistTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistPromptInput {
  kind: AiFlowKind;
  /** The open flow as Home Assistant YAML (what saving would write, without FLODE metadata). */
  flowYaml: string;
  request: string;
  entities: readonly AiEntityCandidate[];
  language: string;
  /** Earlier turns of this conversation (oldest first). */
  history?: readonly AssistTurn[];
}

/** How many earlier turns go back into the prompt. */
const MAX_ASSIST_HISTORY = 6;

/**
 * The assistant beside the editor: answers questions about the open flow,
 * finds mistakes and — only when a change is wanted — proposes the complete
 * updated YAML in one fenced block the editor can apply.
 */
export function buildAssistInstructions({
  kind,
  flowYaml,
  request,
  entities,
  language,
  history = [],
}: AssistPromptInput): string {
  const noun = kind === 'script' ? 'script' : 'automation';
  return [
    `You are the assistant inside FLODE, a visual editor for Home Assistant ${noun}s. The user has the ${noun} below open.`,
    `Always answer in this language: ${language}. Be concise and concrete; Markdown is fine.`,
    `If the user asks a question or wants an analysis (explain, find mistakes, review), answer in text only — no YAML.`,
    `If the user wants a change (fix, optimize, add, remove, rename …) or you propose fixes they asked for: first explain the changes in a few bullet points, then give the COMPLETE updated ${noun} as exactly ONE \`\`\`yaml fenced block. Nothing after the block.`,
    ...KIND_RULES[kind].slice(1),
    'Step syntax: wait a fixed time with `- delay: "00:05:00"` (never `action: delay`); branch with `- if: [...] then: [...] else: [...]`; wait with `wait_for_trigger` / `wait_template`.',
    'Keep alias, description and everything the user did not ask to change. Only use entity ids that appear in the current YAML or in the list below.',
    '',
    `Current ${noun}:`,
    '```yaml',
    flowYaml.trim(),
    '```',
    '',
    'Available entities (entity_id | name | area):',
    entityLines(entities) || '- (none matched)',
    ...(history.length > 0
      ? [
          '',
          'Conversation so far:',
          ...history
            .slice(-MAX_ASSIST_HISTORY)
            .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text.trim()}`),
        ]
      : []),
    '',
    'User:',
    request.trim(),
  ].join('\n');
}

export interface AssistReply {
  /** The answer / explanation, without the YAML block. */
  text: string;
  /** The proposed complete flow, if the reply contains one. */
  yaml?: string;
}

/** Splits an assistant reply into its text and the proposed YAML (if any). */
export function parseAssistReply(reply: string): AssistReply {
  const fenced = reply.match(/```(?:ya?ml)[ \t]*\n([\s\S]*?)```/i);
  if (!fenced || fenced[1] === undefined) return { text: reply.trim() };
  return { text: reply.replace(fenced[0], '').trim(), yaml: fenced[1].trim() };
}
