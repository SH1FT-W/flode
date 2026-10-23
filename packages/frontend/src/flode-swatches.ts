import type { AnnotationColor } from '@flode/shared';
import { css, html, LitElement, nothing } from 'lit';
import { COLORS, tintOf } from './annotations';
import { defineElement } from './define-element';
import { t } from './strings';

/** What was picked: a colour, or none (`null`, a card back to its own colour); `final` once the wheel lets go. */
export interface ColorPick {
  color: AnnotationColor | null;
  final: boolean;
}

/** A colour picked on the wheel (the named ones are not hex). */
function isWheelColor(color: string): boolean {
  return color.startsWith('#');
}

/**
 * The colours to pick from — the six of the palette and the wheel — with the
 * current one marked: above a note or frame, and above a tinted card (#28).
 * Emits `color-pick` ({@link ColorPick}); the wheel previews while it moves.
 */
export class FlodeSwatches extends LitElement {
  static properties = {
    current: { attribute: false },
    language: { attribute: false },
    clearable: { type: Boolean },
  };

  declare current: AnnotationColor | undefined;
  declare language: string;
  /** Offers "no colour" as well. */
  declare clearable: boolean;

  constructor() {
    super();
    this.language = 'en';
    this.clearable = false;
  }

  private pick(color: AnnotationColor | null, final = true): void {
    const detail: ColorPick = { color, final };
    this.dispatchEvent(new CustomEvent('color-pick', { detail, bubbles: true, composed: true }));
  }

  private onWheel(event: Event, final: boolean): void {
    if (event.target instanceof HTMLInputElement) this.pick(event.target.value, final);
  }

  protected render() {
    const current = this.current;
    return html`<div class="swatches" @pointerdown=${(e: Event) => e.stopPropagation()}>
      ${
        this.clearable
          ? html`<button
              class="swatch none ${current ? '' : 'current'}"
              aria-label=${t(this.language, 'noColor')}
              title=${t(this.language, 'noColor')}
              @click=${() => this.pick(null)}
            ></button>`
          : nothing
      }
      ${COLORS.map(
        (color) => html`<button
          class="swatch ${color === current ? 'current' : ''}"
          style="--tint:${tintOf(color, color)}"
          aria-label=${color}
          @click=${() => this.pick(color)}
        ></button>`
      )}
      <label class="wheel" title=${t(this.language, 'colorWheel')}>
        <input
          type="color"
          .value=${current && isWheelColor(current) ? current : '#3b82f6'}
          @input=${(e: Event) => this.onWheel(e, false)}
          @change=${(e: Event) => this.onWheel(e, true)}
        />
      </label>
    </div>`;
  }

  static styles = css`
    .swatches {
      display: flex;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 999px;
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      pointer-events: auto;
      cursor: default;
    }
    .swatch {
      all: unset;
      width: 16px;
      height: 16px;
      box-sizing: border-box;
      border-radius: 50%;
      background: rgb(var(--tint));
      cursor: pointer;
    }
    .swatch.none {
      background: linear-gradient(
        135deg,
        transparent 45%,
        var(--secondary-text-color) 45%,
        var(--secondary-text-color) 55%,
        transparent 55%
      );
      border: 1.5px solid var(--secondary-text-color);
    }
    .swatch.current {
      outline: 2px solid var(--primary-text-color);
      outline-offset: 1px;
    }
    .wheel {
      position: relative;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      cursor: pointer;
      background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
    }
    .wheel input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
  `;
}

defineElement('flode-swatches', FlodeSwatches);

declare global {
  interface HTMLElementTagNameMap {
    'flode-swatches': FlodeSwatches;
  }
}
