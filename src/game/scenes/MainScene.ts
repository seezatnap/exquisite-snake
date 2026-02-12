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

/**
 * Primary gameplay scene.
 *
 * Manages the game loop phases (start → playing → gameOver), draws the
 * arena grid, tracks score / high-score / elapsed survival time, and
 * pushes every state change through the Phaser↔React bridge so overlay
 * components can react.
 */
export class MainScene extends Phaser.Scene {
  // ── State ───────────────────────────────────────────────────
  private phase: GamePhase = "start";
  private score = 0;
  private highScore = 0;
  /** Accumulated play-time in ms for the current run. */
  private elapsedTime = 0;

  constructor() {
    super({ key: "MainScene" });
  }

  // ── Phaser lifecycle ────────────────────────────────────────

  create(): void {
    this.drawGrid();
    this.enterPhase("start");
  }

  update(_time: number, delta: number): void {
    if (this.phase === "playing") {
      this.elapsedTime += delta;
      gameBridge.setElapsedTime(this.elapsedTime);
    }
  }

  // ── Phase management ────────────────────────────────────────

  /** Transition to a new game phase and notify the bridge. */
  enterPhase(next: GamePhase): void {
    this.phase = next;
    gameBridge.setPhase(next);

    if (next === "playing") {
      this.startRun();
    }
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  // ── Run lifecycle ───────────────────────────────────────────

  /** Reset per-run state and begin a new game. */
  private startRun(): void {
    this.score = 0;
    this.elapsedTime = 0;
    gameBridge.resetRun();
  }

  /** End the current run: persist high-score and transition to gameOver. */
  endRun(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      gameBridge.setHighScore(this.highScore);
    }
    this.enterPhase("gameOver");
  }

  // ── Score helpers ───────────────────────────────────────────

  addScore(points: number): void {
    this.score += points;
    gameBridge.setScore(this.score);
  }

  getScore(): number {
    return this.score;
  }

  getHighScore(): number {
    return this.highScore;
  }

  setHighScore(value: number): void {
    this.highScore = value;
    gameBridge.setHighScore(value);
  }

  getElapsedTime(): number {
    return this.elapsedTime;
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
