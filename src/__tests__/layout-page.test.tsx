import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import fs from "fs";
import path from "path";

// Mock next/dynamic to render the component synchronously in tests
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const DynamicComponent = () =>
      createElement("div", { "data-testid": "dynamic-game", id: "game-container" });
    DynamicComponent.displayName = "DynamicGame";
    return DynamicComponent;
  },
}));

// Must import after mocking
import Home from "@/app/page";

const ROOT = path.resolve(__dirname, "../..");

describe("page.tsx", () => {
  it("renders without crashing", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("main")).toBeTruthy();
  });

  it("renders the Game component mount point", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("[data-testid='dynamic-game']")).toBeTruthy();
  });

  it("renders HUD overlay layer", () => {
    const { container } = render(<Home />);
    expect(container.querySelector('[id="hud"]')).toBeTruthy();
  });

  it("renders StartScreen overlay layer", () => {
    const { container } = render(<Home />);
    expect(container.querySelector('[id="start-screen"]')).toBeTruthy();
  });

  it("renders GameOver overlay layer", () => {
    const { container } = render(<Home />);
    expect(container.querySelector('[id="game-over"]')).toBeTruthy();
  });

  it("has proper overlay z-index layering (HUD < StartScreen < GameOver)", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main")!;
    const overlayDivs = main.querySelectorAll("[class*='z-']");

    const zClasses = Array.from(overlayDivs).map((el) => {
      const classes = el.className.split(" ");
      return classes.find((c) => c.startsWith("z-")) ?? "";
    });

    // Expect z-10, z-20, z-30 in ascending order for HUD, Start, GameOver
    expect(zClasses).toContain("z-10");
    expect(zClasses).toContain("z-20");
    expect(zClasses).toContain("z-30");

    const zValues = zClasses
      .map((c) => parseInt(c.replace("z-", ""), 10))
      .filter((v) => !isNaN(v));
    // Verify ascending order
    for (let i = 1; i < zValues.length; i++) {
      expect(zValues[i]).toBeGreaterThan(zValues[i - 1]);
    }
  });

  it("overlay containers use absolute positioning", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main")!;
    const overlayDivs = main.querySelectorAll("[class*='absolute']");

    // At least 3 overlay layers
    expect(overlayDivs.length).toBeGreaterThanOrEqual(3);
  });

  it("main container uses relative positioning for overlay stacking context", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main")!;
    expect(main.className).toContain("relative");
  });

  it("uses dynamic import for Game component (ssr: false)", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/page.tsx"),
      "utf-8"
    );
    expect(source).toContain("dynamic(");
    expect(source).toContain("ssr: false");
  });
});

describe("layout.tsx", () => {
  it("imports globals.css", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/layout.tsx"),
      "utf-8"
    );
    expect(source).toContain('@/styles/globals.css');
  });

  it("sets up Geist font variables", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/layout.tsx"),
      "utf-8"
    );
    expect(source).toContain("--font-geist-sans");
    expect(source).toContain("--font-geist-mono");
  });

  it("applies antialiased, bg-background, and text-foreground classes", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/layout.tsx"),
      "utf-8"
    );
    expect(source).toContain("antialiased");
    expect(source).toContain("bg-background");
    expect(source).toContain("text-foreground");
  });

  it("applies overflow-hidden for fullscreen game containment", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/layout.tsx"),
      "utf-8"
    );
    expect(source).toContain("overflow-hidden");
  });

  it("exports metadata with title and description", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/layout.tsx"),
      "utf-8"
    );
    expect(source).toContain("Exquisite Snake");
    expect(source).toContain("metadata");
  });
});

describe("globals.css neon theme tokens", () => {
  it("defines neon-pink CSS variable", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "src/styles/globals.css"),
      "utf-8"
    );
    expect(css).toContain("--neon-pink");
  });

  it("defines neon-cyan CSS variable", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "src/styles/globals.css"),
      "utf-8"
    );
    expect(css).toContain("--neon-cyan");
  });

  it("defines surface CSS variable for panels", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "src/styles/globals.css"),
      "utf-8"
    );
    expect(css).toContain("--surface");
  });

  it("registers neon colors as Tailwind theme tokens", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "src/styles/globals.css"),
      "utf-8"
    );
    expect(css).toContain("--color-neon-pink");
    expect(css).toContain("--color-neon-cyan");
  });
});
