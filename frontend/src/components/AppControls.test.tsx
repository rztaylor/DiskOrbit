import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppControls } from "./AppControls";

describe("AppControls", () => {
  it("renders matching accessible icon controls", () => {
    const markup = renderToStaticMarkup(
      <AppControls
        disabled={false}
        stopping={false}
        scanState={undefined}
        theme="light"
        settingsActive={false}
        settingsDisabled={false}
        onSettings={vi.fn()}
        onStop={vi.fn()}
        onTheme={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Switch to dark theme"');
    expect(markup).toContain('aria-label="Quit"');
    expect(markup).toContain('aria-label="Open settings"');
    expect(markup.match(/class="icon-button/g)).toHaveLength(3);
    expect(markup).not.toContain(">Quit</button>");
  });

  it("places an active scan stop action in the icon control cluster", () => {
    const markup = renderToStaticMarkup(
      <AppControls
        disabled={false}
        stopping={false}
        scanState="scanning"
        theme="dark"
        settingsActive={false}
        settingsDisabled={true}
        onSettings={vi.fn()}
        onStop={vi.fn()}
        onTheme={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Stop scan"');
    expect(markup).toContain("icon-button--danger");
    expect(markup.match(/class="icon-button/g)).toHaveLength(4);
  });
});
