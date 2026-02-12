import Phaser from "phaser";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  COLORS,
} from "../config";
import { gameBridge, type GamePhase } from "../bridge";
import { loadHighScore, saveHighScore } from "../utils/storage";

/**
 * Primary gameplay scene.
 *
 * Manages the game loop phases (start → playing → gameOver), draws the
 * arena grid, and delegates all score / high-score / elapsed survival
 * time state to the Phaser↔React bridge (single source of truth) so
 * overlay components and external consumers stay in sync.
 */
export class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: "MainScene" });
  }

  // ── Phaser lifecycle ────────────────────────────────────────

  create(): void {
    this.drawGrid();
    gameBridge.setHighScore(loadHighScore());
    this.enterPhase("start");
  }

  update(_time: number, delta: number): void {
    if (gameBridge.getState().phase === "playing") {
      gameBridge.setElapsedTime(gameBridge.getState().elapsedTime + delta);
    }
  }

  // ── Phase management ────────────────────────────────────────

  /** Transition to a new game phase and notify the bridge. */
  enterPhase(next: GamePhase): void {
    gameBridge.setPhase(next);

    if (next === "playing") {
      this.startRun();
    }
  }

  getPhase(): GamePhase {
    return gameBridge.getState().phase;
  }

  // ── Run lifecycle ───────────────────────────────────────────

  /** Reset per-run state and begin a new game. */
  private startRun(): void {
    gameBridge.resetRun();
  }

  /** End the current run: persist high-score and transition to gameOver. */
  endRun(): void {
    const { score, highScore } = gameBridge.getState();
    if (score > highScore) {
      gameBridge.setHighScore(score);
      saveHighScore(score);
    }
    this.enterPhase("gameOver");
  }

  // ── Score helpers ───────────────────────────────────────────

  addScore(points: number): void {
    gameBridge.setScore(gameBridge.getState().score + points);
  }

  getScore(): number {
    return gameBridge.getState().score;
  }

  getHighScore(): number {
    return gameBridge.getState().highScore;
  }

  setHighScore(value: number): void {
    gameBridge.setHighScore(value);
  }

  getElapsedTime(): number {
    return gameBridge.getState().elapsedTime;
  }

  // ── Arena grid ──────────────────────────────────────────────

  private drawGrid(): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, COLORS.GRID_LINE, 0.08);

    // Vertical lines
    for (let col = 1; col < GRID_COLS; col++) {
      const x = col * TILE_SIZE;
      gfx.moveTo(x, 0);
      gfx.lineTo(x, ARENA_HEIGHT);
    }

    // Horizontal lines
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = row * TILE_SIZE;
      gfx.moveTo(0, y);
      gfx.lineTo(ARENA_WIDTH, y);
    }

    gfx.strokePath();
  }
}
