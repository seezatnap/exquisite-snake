import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import fs from "fs";
import path from "path";

vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const DynamicComponent = () =>
      createElement("div", {
        "data-testid": "dynamic-game",
        id: "game-container",
      });
    DynamicComponent.displayName = "DynamicGame";
    return DynamicComponent;
  },
}));

import Home from "@/app/page";

const ROOT = path.resolve(__dirname, "../..");

describe("page.tsx neon layout integration", () => {
  it("main element uses game-wrapper class for responsive centering", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main")!;
    expect(main.className).toContain("game-wrapper");
  });

  it("wraps Game component in arena-grid container for visible grid lines", () => {
    const { container } = render(<Home />);
    const arenaGrid = container.querySelector(".arena-grid");
    expect(arenaGrid).toBeTruthy();
    expect(
      arenaGrid!.querySelector("[data-testid='dynamic-game']")
    ).toBeTruthy();
  });

  it("arena-grid wrapper is inside main", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main")!;
    expect(main.querySelector(".arena-grid")).toBeTruthy();
  });

  it("page.tsx source uses arena-grid class", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/page.tsx"),
      "utf-8"
    );
    expect(source).toContain("arena-grid");
  });

  it("page.tsx source uses game-wrapper class", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/page.tsx"),
      "utf-8"
    );
    expect(source).toContain("game-wrapper");
  });
});
