import type { ScanState } from "../api/scans";
import type { ResolvedTheme } from "../api/settings";

interface AppControlsProps {
  disabled: boolean;
  stopping: boolean;
  scanState?: ScanState;
  theme: ResolvedTheme;
  settingsActive: boolean;
  settingsDisabled: boolean;
  onSettings(): void;
  onStop(): void;
  onTheme(theme: ResolvedTheme): void;
  onQuit(): void;
}

export function AppControls({ disabled, stopping, scanState, theme, settingsActive, settingsDisabled, onSettings, onStop, onTheme, onQuit }: AppControlsProps) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const scanActive = scanState === "queued" || scanState === "scanning" || scanState === "cancelling";

  return (
    <div className="app-controls">
      {scanActive ? (
        <button
          className="icon-button icon-button--danger"
          type="button"
          aria-label={scanState === "cancelling" ? "Stopping scan" : "Stop scan"}
          title={scanState === "cancelling" ? "Stopping scan" : "Stop scan"}
          onClick={onStop}
          disabled={disabled || scanState === "cancelling"}
        >
          <StopIcon />
        </button>
      ) : null}
      <button
        className={`icon-button${settingsActive ? " icon-button--active" : ""}`}
        type="button"
        aria-label={settingsActive ? "Close settings" : "Open settings"}
        title={settingsDisabled ? "Stop the active scan before changing settings" : settingsActive ? "Close settings" : "Settings"}
        aria-pressed={settingsActive}
        onClick={onSettings}
        disabled={disabled || settingsDisabled}
      >
        <SettingsIcon />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label={`Switch to ${nextTheme} theme`}
        title={`Switch to ${nextTheme} theme`}
        onClick={() => onTheme(nextTheme)}
        disabled={disabled}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        className="icon-button icon-button--primary"
        type="button"
        aria-label={stopping ? "Stopping DiskOrbit" : "Quit"}
        title={stopping ? "Stopping DiskOrbit" : "Quit"}
        onClick={onQuit}
        disabled={disabled || stopping}
      >
        <PowerIcon />
      </button>
    </div>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect className="stop-icon__shape" x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5v9M7.1 5.7a8 8 0 1 0 9.8 0" />
    </svg>
  );
}
