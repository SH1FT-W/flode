import { css, html, LitElement, nothing } from 'lit';
import { version } from '../package.json';
import { type StringKey, t } from './strings';

export const FLODE_VERSION: string = version;

interface Feature {
  icon: string;
  title: StringKey;
  text: StringKey;
}

/** First visit: what FLODE is. */
const WELCOME: Feature[] = [
  { icon: 'mdi:sitemap-outline', title: 'welcomeFlowTitle', text: 'welcomeFlowText' },
  { icon: 'mdi:history', title: 'welcomeRunsTitle', text: 'welcomeRunsText' },
  { icon: 'mdi:creation-outline', title: 'welcomeAiTitle', text: 'welcomeAiText' },
  { icon: 'mdi:graph-outline', title: 'welcomeMapTitle', text: 'welcomeMapText' },
];

/**
 * After an update: the new features of this release. Update with every
 * release — shown once per version (`package.json`) to everyone who used an older one.
 */
const WHATS_NEW: Feature[] = [
  { icon: 'mdi:unfold-more-horizontal', title: 'new306RowsTitle', text: 'new306RowsText' },
  { icon: 'mdi:form-textbox', title: 'new306NameTitle', text: 'new306NameText' },
];

const SEEN_KEY = 'flode3.seenVersion';
const CHANGELOG_URL = 'https://github.com/SH1FT-W/flode/blob/main/CHANGELOG.md';

export type WelcomeMode = 'welcome' | 'whatsNew';

/** Stored while the welcome sheet is still to be shown (survives HA reloading the page). */
const WELCOME_PENDING = '';

function detectMode(): WelcomeMode | null {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen === FLODE_VERSION) return null;
    if (seen === WELCOME_PENDING) return 'welcome';
    if (seen !== null) return 'whatsNew';
    // Used FLODE before this sheet existed (it left other `flode3.*` keys) → an update.
    if (Object.keys(localStorage).some((key) => key.startsWith('flode3.'))) return 'whatsNew';
    localStorage.setItem(SEEN_KEY, WELCOME_PENDING);
    return 'welcome';
  } catch {
    return null;
  }
}

/** Decided when FLODE loads — before the panel writes its own `flode3.*` keys. */
let startMode = detectMode();

/** Which sheet to show on this start, if any (no storage → none). */
export function welcomeMode(): WelcomeMode | null {
  return startMode;
}

function markSeen(): void {
  startMode = null;
  try {
    localStorage.setItem(SEEN_KEY, FLODE_VERSION);
  } catch {
    // Without storage the sheet just shows again — no error.
  }
}

/** "Welcome to FLODE" / "New in FLODE x.y.z" — like the "What's new" screen after an iOS update. */
export class FlodeWelcome extends LitElement {
  static properties = {
    language: { attribute: false },
    mode: { attribute: false },
  };

  declare language: string;
  declare mode: WelcomeMode | null;

  constructor() {
    super();
    this.language = 'en';
    this.mode = null;
  }

  private close(): void {
    markSeen();
    this.mode = null;
    this.dispatchEvent(new CustomEvent('closed'));
  }

  render() {
    if (!this.mode) return nothing;
    const language = this.language;
    const welcome = this.mode === 'welcome';
    const features = welcome ? WELCOME : WHATS_NEW;
    return html`<ha-dialog open @closed=${() => this.close()}>
      <div class="sheet">
        <svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="flode-welcome-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#132036" />
              <stop offset="1" stop-color="#0b1220" />
            </linearGradient>
            <linearGradient id="flode-welcome-f" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#4cc9fb" />
              <stop offset="1" stop-color="#0ea5e9" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="22" fill="url(#flode-welcome-bg)" />
          <path
            d="M33 79 V27 H62 M33 53 H52"
            fill="none"
            stroke="url(#flode-welcome-f)"
            stroke-width="12"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="70" cy="27" r="8.5" fill="#0b1220" stroke="#a78bfa" stroke-width="5" />
          <circle cx="60" cy="53" r="8.5" fill="#0b1220" stroke="#a78bfa" stroke-width="5" />
        </svg>
        <h2>
          ${welcome ? t(language, 'welcomeTitle') : t(language, 'whatsNewTitle').replace('{version}', FLODE_VERSION)}
        </h2>
        <ul>
          ${features.map(
            (feature) => html`<li>
              <ha-icon icon=${feature.icon}></ha-icon>
              <span><b>${t(language, feature.title)}</b><br />${t(language, feature.text)}</span>
            </li>`
          )}
        </ul>
        <button class="go" @click=${() => this.close()}>${t(language, 'continue')}</button>
        ${
          welcome
            ? nothing
            : html`<a class="all" href=${CHANGELOG_URL} target="_blank" rel="noreferrer">
                ${t(language, 'whatsNewAll')}
              </a>`
        }
      </div>
    </ha-dialog>`;
  }

  static styles = css`
    .sheet {
      display: grid;
      justify-items: center;
      gap: 18px;
      padding: 8px 4px 4px;
      max-width: 440px;
      margin: 0 auto;
    }
    .mark {
      width: 64px;
      height: 64px;
      filter: drop-shadow(0 10px 24px rgba(14, 165, 233, 0.45));
    }
    h2 {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.03em;
      text-align: center;
      text-wrap: balance;
    }
    ul {
      list-style: none;
      margin: 8px 0;
      padding: 0;
      display: grid;
      gap: 18px;
    }
    li {
      display: grid;
      grid-template-columns: 40px 1fr;
      gap: 14px;
      align-items: start;
      line-height: 1.4;
      color: var(--secondary-text-color);
    }
    li b {
      color: var(--primary-text-color);
      font-weight: 600;
    }
    li ha-icon {
      --mdc-icon-size: 30px;
      color: #0ea5e9;
      margin-top: 2px;
    }
    .go {
      width: 100%;
      height: 52px;
      border: 0;
      border-radius: 26px;
      background: linear-gradient(180deg, #4cc9fb, #0ea5e9);
      color: #fff;
      font: inherit;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
    }
    .go:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 3px;
    }
    .all {
      color: var(--primary-color);
      font-size: 14px;
      text-decoration: none;
    }
  `;
}

customElements.define('flode-welcome', FlodeWelcome);
