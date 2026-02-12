import type { Direction, GridPosition } from "../utils/grid";
import {
  advanceGridPosition,
  createGridStepClock,
  getOppositeDirection,
  isOppositeDirection,
} from "../utils/grid";

export const DEFAULT_SNAKE_LENGTH = 3;
export const DEFAULT_SNAKE_DIRECTION: Direction = "right";
export const DEFAULT_SNAKE_INPUT_BUFFER_SIZE = 3;
export const DEFAULT_TOUCH_SWIPE_THRESHOLD_PX = 24;
export const DEFAULT_TOUCH_SWIPE_DEBOUNCE_MS = 80;
const DEFAULT_HEAD_POSITION: GridPosition = Object.freeze({ x: 8, y: 8 });
const FALLBACK_TOUCH_POINTER_ID = -1;

type KeyboardDirectionEvent = Readonly<{
  key?: string | null;
  code?: string | null;
  preventDefault?: () => void;
}>;

export type KeyboardDirectionInput = Readonly<{
  key?: string | null;
  code?: string | null;
}>;

type TouchDirectionEvent = Readonly<{
  id?: number | null;
  x?: number | null;
  y?: number | null;
  upTime?: number | null;
  time?: number | null;
  event?: Readonly<{
    timeStamp?: number | null;
  }> | null;
}>;

export type SwipeDirectionInput = Readonly<{
  startX?: number | null;
  startY?: number | null;
  endX?: number | null;
  endY?: number | null;
  eventTimeMs?: number | null;
}>;

export type KeyboardDirectionEmitter = {
  on(
    eventName: "keydown",
    listener: (event: KeyboardDirectionEvent) => void,
    context?: unknown,
  ): unknown;
  off(
    eventName: "keydown",
    listener: (event: KeyboardDirectionEvent) => void,
    context?: unknown,
  ): unknown;
};

export type TouchDirectionEmitter = {
  on(
    eventName: "pointerdown" | "pointerup",
    listener: (event?: TouchDirectionEvent, ...args: unknown[]) => void,
    context?: unknown,
  ): unknown;
  off(
    eventName: "pointerdown" | "pointerup",
    listener: (event?: TouchDirectionEvent, ...args: unknown[]) => void,
    context?: unknown,
  ): unknown;
};

export type SnakeOptions = Readonly<{
  initialHeadPosition?: GridPosition;
  initialDirection?: Direction;
  initialLength?: number;
  inputBufferSize?: number;
  stepDurationMs?: number;
  touchSwipeThresholdPx?: number;
  touchSwipeDebounceMs?: number;
}>;

const KEYBOARD_DIRECTION_MAP: Readonly<Record<string, Direction>> = Object.freeze(
  {
    arrowup: "up",
    arrowright: "right",
    arrowdown: "down",
    arrowleft: "left",
    w: "up",
    a: "left",
    s: "down",
    d: "right",
    keyw: "up",
    keya: "left",
    keys: "down",
    keyd: "right",
  },
);

const sanitizePositiveInteger = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalizedValue = Math.floor(value);
  return normalizedValue > 0 ? normalizedValue : fallback;
};

const sanitizeNonNegativeInteger = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
};

const sanitizeNonNegativeIntegerWithFallback = (
  value: number,
  fallback: number,
): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
};

const normalizeFiniteNumber = (value?: number | null): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const cloneGridPosition = (position: GridPosition): GridPosition => ({
  x: position.x,
  y: position.y,
});

const cloneSegments = (segments: ReadonlyArray<GridPosition>): GridPosition[] =>
  segments.map(cloneGridPosition);

const normalizeKeyboardToken = (token?: string | null): string | null => {
  if (typeof token !== "string") {
    return null;
  }

  const normalizedToken = token.trim().toLowerCase();
  return normalizedToken.length > 0 ? normalizedToken : null;
};

const buildInitialSegments = (
  headPosition: GridPosition,
  direction: Direction,
  length: number,
): GridPosition[] => {
  const tailDirection = getOppositeDirection(direction);

  return Array.from({ length }, (_, index) =>
    advanceGridPosition(headPosition, tailDirection, index),
  );
};

export const keyboardInputToDirection = (
  input: KeyboardDirectionInput,
): Direction | null => {
  const normalizedCode = normalizeKeyboardToken(input.code);
  if (normalizedCode) {
    const directionFromCode = KEYBOARD_DIRECTION_MAP[normalizedCode];
    if (directionFromCode) {
      return directionFromCode;
    }
  }

  const normalizedKey = normalizeKeyboardToken(input.key);
  if (!normalizedKey) {
    return null;
  }

  return KEYBOARD_DIRECTION_MAP[normalizedKey] ?? null;
};

export const swipeInputToDirection = (
  input: SwipeDirectionInput,
  swipeThresholdPx = DEFAULT_TOUCH_SWIPE_THRESHOLD_PX,
): Direction | null => {
  const startX = normalizeFiniteNumber(input.startX);
  const startY = normalizeFiniteNumber(input.startY);
  const endX = normalizeFiniteNumber(input.endX);
  const endY = normalizeFiniteNumber(input.endY);

  if (startX === null || startY === null || endX === null || endY === null) {
    return null;
  }

  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);
  const threshold = sanitizePositiveInteger(
    swipeThresholdPx,
    DEFAULT_TOUCH_SWIPE_THRESHOLD_PX,
  );

  if (absDeltaX >= absDeltaY) {
    if (absDeltaX < threshold) {
      return null;
    }

    return deltaX >= 0 ? "right" : "left";
  }

  if (absDeltaY < threshold) {
    return null;
  }

  return deltaY >= 0 ? "down" : "up";
};

const normalizePointerId = (pointerId?: number | null): number => {
  const normalizedPointerId = normalizeFiniteNumber(pointerId);
  if (normalizedPointerId === null) {
    return FALLBACK_TOUCH_POINTER_ID;
  }

  return Math.floor(normalizedPointerId);
};

const resolveTouchEventTimeMs = (
  event?: TouchDirectionEvent,
): number | null => {
  if (!event) {
    return null;
  }

  const upTime = normalizeFiniteNumber(event.upTime);
  if (upTime !== null) {
    return upTime;
  }

  const explicitTime = normalizeFiniteNumber(event.time);
  if (explicitTime !== null) {
    return explicitTime;
  }

  return normalizeFiniteNumber(event.event?.timeStamp ?? null);
};

const resolveSwipeEventTimeMs = (input: SwipeDirectionInput): number | null =>
  normalizeFiniteNumber(input.eventTimeMs);

export class Snake {
  private segments: GridPosition[];

  private currentDirection: Direction;

  private readonly pendingDirectionQueue: Direction[] = [];

  private pendingGrowthSegments = 0;

  private readonly inputBufferSize: number;

  private readonly stepClock: ReturnType<typeof createGridStepClock>;

  private keyboardEmitter?: KeyboardDirectionEmitter;

  private touchEmitter?: TouchDirectionEmitter;

  private readonly touchStartByPointerId = new Map<number, GridPosition>();

  private readonly touchSwipeThresholdPx: number;

  private readonly touchSwipeDebounceMs: number;

  private lastQueuedSwipeAtMs: number | null = null;

  private readonly keyboardListener = (event: KeyboardDirectionEvent): void => {
    if (this.queueDirectionFromKeyboard(event)) {
      event.preventDefault?.();
    }
  };

  private readonly touchPointerDownListener = (
    event?: TouchDirectionEvent,
  ): void => {
    if (!event) {
      return;
    }

    const x = normalizeFiniteNumber(event.x);
    const y = normalizeFiniteNumber(event.y);

    if (x === null || y === null) {
      return;
    }

    this.touchStartByPointerId.set(normalizePointerId(event.id), { x, y });
  };

  private readonly touchPointerUpListener = (
    event?: TouchDirectionEvent,
  ): void => {
    if (!event) {
      return;
    }

    const pointerId = normalizePointerId(event.id);
    const startPosition = this.touchStartByPointerId.get(pointerId);
    this.touchStartByPointerId.delete(pointerId);

    if (!startPosition) {
      return;
    }

    const endX = normalizeFiniteNumber(event.x);
    const endY = normalizeFiniteNumber(event.y);
    if (endX === null || endY === null) {
      return;
    }

    this.queueDirectionFromSwipe({
      startX: startPosition.x,
      startY: startPosition.y,
      endX,
      endY,
      eventTimeMs: resolveTouchEventTimeMs(event),
    });
  };

  constructor(options: SnakeOptions = {}) {
    const initialDirection = options.initialDirection ?? DEFAULT_SNAKE_DIRECTION;
    const initialLength = sanitizePositiveInteger(
      options.initialLength ?? DEFAULT_SNAKE_LENGTH,
      DEFAULT_SNAKE_LENGTH,
    );
    const initialHeadPosition = options.initialHeadPosition ?? DEFAULT_HEAD_POSITION;

    this.currentDirection = initialDirection;
    this.inputBufferSize = sanitizePositiveInteger(
      options.inputBufferSize ?? DEFAULT_SNAKE_INPUT_BUFFER_SIZE,
      DEFAULT_SNAKE_INPUT_BUFFER_SIZE,
    );
    this.touchSwipeThresholdPx = sanitizePositiveInteger(
      options.touchSwipeThresholdPx ?? DEFAULT_TOUCH_SWIPE_THRESHOLD_PX,
      DEFAULT_TOUCH_SWIPE_THRESHOLD_PX,
    );
    this.touchSwipeDebounceMs = sanitizeNonNegativeIntegerWithFallback(
      options.touchSwipeDebounceMs ?? DEFAULT_TOUCH_SWIPE_DEBOUNCE_MS,
      DEFAULT_TOUCH_SWIPE_DEBOUNCE_MS,
    );
    this.stepClock = createGridStepClock(options.stepDurationMs);
    this.segments = buildInitialSegments(
      initialHeadPosition,
      initialDirection,
      initialLength,
    );
  }

  get direction(): Direction {
    return this.currentDirection;
  }

  get head(): GridPosition {
    return cloneGridPosition(this.segments[0]);
  }

  get length(): number {
    return this.segments.length;
  }

  get queuedDirections(): ReadonlyArray<Direction> {
    return [...this.pendingDirectionQueue];
  }

  get pendingGrowth(): number {
    return this.pendingGrowthSegments;
  }

  get interpolationAlpha(): number {
    return this.stepClock.interpolationAlpha;
  }

  get stepDurationMs(): number {
    return this.stepClock.durationMs;
  }

  getSegments(): ReadonlyArray<GridPosition> {
    return cloneSegments(this.segments);
  }

  queueDirection(direction: Direction): boolean {
    if (this.pendingDirectionQueue.length >= this.inputBufferSize) {
      return false;
    }

    const referenceDirection =
      this.pendingDirectionQueue[this.pendingDirectionQueue.length - 1] ??
      this.currentDirection;

    if (
      direction === referenceDirection ||
      isOppositeDirection(referenceDirection, direction)
    ) {
      return false;
    }

    this.pendingDirectionQueue.push(direction);
    return true;
  }

  queueDirectionFromKeyboard(input: KeyboardDirectionInput): boolean {
    const direction = keyboardInputToDirection(input);

    if (!direction) {
      return false;
    }

    return this.queueDirection(direction);
  }

  queueDirectionFromSwipe(input: SwipeDirectionInput): boolean {
    const direction = swipeInputToDirection(input, this.touchSwipeThresholdPx);
    if (!direction) {
      return false;
    }

    const swipeEventTimeMs = resolveSwipeEventTimeMs(input);
    if (
      swipeEventTimeMs !== null &&
      this.lastQueuedSwipeAtMs !== null &&
      swipeEventTimeMs - this.lastQueuedSwipeAtMs < this.touchSwipeDebounceMs
    ) {
      return false;
    }

    const hasQueuedDirection = this.queueDirection(direction);
    if (hasQueuedDirection && swipeEventTimeMs !== null) {
      this.lastQueuedSwipeAtMs = swipeEventTimeMs;
    }

    return hasQueuedDirection;
  }

  bindKeyboardControls(keyboardEmitter: KeyboardDirectionEmitter | null): void {
    if (!keyboardEmitter) {
      this.unbindKeyboardControls();
      return;
    }

    if (this.keyboardEmitter === keyboardEmitter) {
      return;
    }

    this.unbindKeyboardControls();
    keyboardEmitter.on("keydown", this.keyboardListener, this);
    this.keyboardEmitter = keyboardEmitter;
  }

  unbindKeyboardControls(): void {
    if (!this.keyboardEmitter) {
      return;
    }

    this.keyboardEmitter.off("keydown", this.keyboardListener, this);
    this.keyboardEmitter = undefined;
  }

  bindTouchControls(touchEmitter: TouchDirectionEmitter | null): void {
    if (!touchEmitter) {
      this.unbindTouchControls();
      return;
    }

    if (this.touchEmitter === touchEmitter) {
      return;
    }

    this.unbindTouchControls();
    touchEmitter.on("pointerdown", this.touchPointerDownListener, this);
    touchEmitter.on("pointerup", this.touchPointerUpListener, this);
    this.touchEmitter = touchEmitter;
  }

  unbindTouchControls(): void {
    if (this.touchEmitter) {
      this.touchEmitter.off("pointerdown", this.touchPointerDownListener, this);
      this.touchEmitter.off("pointerup", this.touchPointerUpListener, this);
      this.touchEmitter = undefined;
    }

    this.touchStartByPointerId.clear();
    this.lastQueuedSwipeAtMs = null;
  }

  grow(segments = 1): void {
    this.pendingGrowthSegments += sanitizeNonNegativeInteger(segments);
  }

  step(): GridPosition {
    this.consumeQueuedDirection();
    const nextHeadPosition = advanceGridPosition(this.segments[0], this.currentDirection);
    const nextSegments = [nextHeadPosition, ...this.segments];

    if (this.pendingGrowthSegments > 0) {
      this.pendingGrowthSegments -= 1;
    } else {
      nextSegments.pop();
    }

    this.segments = nextSegments;
    return cloneGridPosition(nextHeadPosition);
  }

  tick(deltaMs: number): number {
    const completedSteps = this.stepClock.tick(deltaMs);

    for (let stepIndex = 0; stepIndex < completedSteps; stepIndex += 1) {
      this.step();
    }

    return completedSteps;
  }

  setStepDuration(stepDurationMs: number): void {
    this.stepClock.setStepDuration(stepDurationMs);
  }

  private consumeQueuedDirection(): void {
    while (this.pendingDirectionQueue.length > 0) {
      const nextDirection = this.pendingDirectionQueue.shift();
      if (!nextDirection) {
        return;
      }

      if (
        nextDirection !== this.currentDirection &&
        !isOppositeDirection(this.currentDirection, nextDirection)
      ) {
        this.currentDirection = nextDirection;
        return;
      }
    }
  }
}
