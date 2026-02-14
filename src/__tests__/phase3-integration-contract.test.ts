import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const MAIN_SCENE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../game/scenes/MainScene.ts"),
  "utf8",
);

function getSection(startToken: string, endToken: string): string {
  const startIndex = MAIN_SCENE_SOURCE.indexOf(startToken);
  expect(startIndex).toBeGreaterThan(-1);

  const endIndex = MAIN_SCENE_SOURCE.indexOf(endToken, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);

  return MAIN_SCENE_SOURCE.slice(startIndex, endIndex);
}

describe("Phase 3 integration contract for parasite scaffolding", () => {
  it("keeps movement -> collision -> scoring -> ghost recording in update flow", () => {
    const updateSection = getSection(
      "update(_time: number, delta: number): void {",
      "\n\n  // ── Phase management",
    );

    const snakeUpdateIndex = updateSection.indexOf(
      "const stepped = this.snake.update(delta);",
    );
    const collisionIndex = updateSection.indexOf("if (this.checkCollisions())");
    const foodIndex = updateSection.indexOf("this.resolveFoodConsumption();");
    const ghostRecordIndex = updateSection.lastIndexOf(
      "this.echoGhost.recordPath(this.snake.getSegments());",
    );

    expect(snakeUpdateIndex).toBeGreaterThan(-1);
    expect(collisionIndex).toBeGreaterThan(-1);
    expect(foodIndex).toBeGreaterThan(-1);
    expect(ghostRecordIndex).toBeGreaterThan(-1);
    expect(snakeUpdateIndex).toBeLessThan(collisionIndex);
    expect(collisionIndex).toBeLessThan(foodIndex);
    expect(foodIndex).toBeLessThan(ghostRecordIndex);
  });

  it("keeps deterministic collision ordering with Echo Ghost in chain", () => {
    const collisionSection = getSection(
      "private checkCollisions(): boolean {",
      "\n\n  private hasEchoGhostCollision",
    );

    const wallIndex = collisionSection.indexOf("if (!isInBounds(head))");
    const selfIndex = collisionSection.indexOf("if (this.snake.hasSelfCollision())");
    const ghostIndex = collisionSection.indexOf("if (this.hasEchoGhostCollision(head))");
    const voidIndex = collisionSection.indexOf("if (this.isVoidRiftCenterHazard(head))");
    const moltenIndex = collisionSection.indexOf("if (this.handleMoltenLavaCollision(head))");

    expect(wallIndex).toBeGreaterThan(-1);
    expect(selfIndex).toBeGreaterThan(-1);
    expect(ghostIndex).toBeGreaterThan(-1);
    expect(voidIndex).toBeGreaterThan(-1);
    expect(moltenIndex).toBeGreaterThan(-1);
    expect(wallIndex).toBeLessThan(selfIndex);
    expect(selfIndex).toBeLessThan(ghostIndex);
    expect(ghostIndex).toBeLessThan(voidIndex);
    expect(voidIndex).toBeLessThan(moltenIndex);
  });

  it("keeps score integration routed through Food.checkEat callback", () => {
    const foodSection = getSection(
      "private resolveFoodConsumption(): void {",
      "\n\n  private queueDelayedEchoGhostFoodBurst",
    );

    expect(foodSection).toContain(
      "const eaten = this.food.checkEat(this.snake, (points) =>",
    );
    expect(foodSection).toContain("this.addScore(points)");
  });

  it("keeps biome transition lifecycle hooks in exit -> transition -> enter order", () => {
    const transitionSection = getSection(
      "private handleBiomeTransition(transition: BiomeTransition): void {",
      "\n\n  private handleBiomeEnter",
    );

    const exitIndex = transitionSection.indexOf("this.handleBiomeExit(transition.from);");
    const syncIndex = transitionSection.indexOf("this.syncBiomeRuntimeToBridge();");
    const transitionEmitIndex = transitionSection.indexOf(
      "gameBridge.emitBiomeTransition(transition);",
    );
    const enterIndex = transitionSection.indexOf("this.handleBiomeEnter(transition.to);");

    expect(exitIndex).toBeGreaterThan(-1);
    expect(syncIndex).toBeGreaterThan(-1);
    expect(transitionEmitIndex).toBeGreaterThan(-1);
    expect(enterIndex).toBeGreaterThan(-1);
    expect(exitIndex).toBeLessThan(syncIndex);
    expect(syncIndex).toBeLessThan(transitionEmitIndex);
    expect(transitionEmitIndex).toBeLessThan(enterIndex);
  });

  it("keeps Echo Ghost collision checks gated on active playback segments", () => {
    const ghostCollisionSection = getSection(
      "private hasEchoGhostCollision(head: GridPos): boolean {",
      "\n\n  // ── Score helpers",
    );

    expect(ghostCollisionSection).toContain(
      "if (!this.echoGhost || !this.echoGhost.isActive())",
    );
    expect(ghostCollisionSection).toContain(
      "const playbackSegments = this.echoGhost.getPlaybackSegments();",
    );
    expect(ghostCollisionSection).toContain("if (gridEquals(segment, head))");
  });
});
