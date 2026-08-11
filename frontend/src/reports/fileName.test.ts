import { describe, expect, it } from "vitest";

import { splitFileName } from "./fileName";

describe("splitFileName", () => {
  it.each([
    ["Docker.raw", { stem: "Docker", extension: ".raw" }],
    ["archive.tar.gz", { stem: "archive.tar", extension: ".gz" }],
    ["README", { stem: "README", extension: "" }],
    ["name.", { stem: "name.", extension: "" }],
    [".profile", { stem: "", extension: ".profile" }],
  ])("splits %s at its final extension", (name, expected) => {
    expect(splitFileName(name)).toEqual(expected);
  });
});
