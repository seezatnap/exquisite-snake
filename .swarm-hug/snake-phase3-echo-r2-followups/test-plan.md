# Snake Phase 3 Echo Followups Test Plan

This plan maps all required echo-ghost validation scenarios to concrete setup, expected outcomes, and execution steps for team validation.

## Preconditions

1. Install dependencies from repo root: `npm ci`
2. Use the same branch/worktree under test.
3. Run commands from repository root.

## Scenario 1: 5-second delay accuracy

- Setup:
  - Use deterministic fake timers and a known snake path fixture.
  - Record path ticks through an `EchoGhost` instance.
- Expected Results:
  - Ghost remains inactive before `+5000 ms`.
  - Ghost activates at exactly `+5000 ms`.
  - Replay head coordinates match source snake path at the delayed index on each frame.
- Execution Steps:
  1. Run `npm test -- src/__tests__/echo-ghost-replay-delay.test.ts`
  2. Validate passing case: `replays a known snake path at exactly +5000 ms with step-by-step coordinate parity`

## Scenario 2: Fade-out and replay completion

- Setup:
  - Restore a controlled active snapshot with a finite replay buffer.
  - Advance playback frame by frame.
- Expected Results:
  - Opacity fades as buffered replay frames are consumed.
  - Ghost deactivates when history is exhausted.
  - No extra movement frames emit after completion.
- Execution Steps:
  1. Run `npm test -- src/__tests__/echo-ghost-replay-completion.test.ts`
  2. Validate passing cases:
     - `fades through remaining replay frames and completes once history is consumed`
     - `does not emit extra movement frames after replay completion`

## Scenario 3: Collision fatality parity

- Setup:
  - Exercise both self-collision and echo-ghost collision in `MainScene`.
  - Capture game-over outcome signals for each path.
- Expected Results:
  - Ghost collision ends the run.
  - Ghost collision follows the same fatal game-over path as self-collision (action/result parity).
- Execution Steps:
  1. Run `npm test -- src/__tests__/main-scene.test.ts`
  2. Validate passing case: `matches self-collision fatal game-over action/result parity`

## Scenario 4: Delayed burst timing and position

- Setup:
  - Use deterministic timers, known snake path fixture, and ghost replay fixture.
  - Enqueue a burst event at food-consumption tick and process queue each tick.
- Expected Results:
  - Exactly one burst fires at `consumedAt + 5000 ms`.
  - Burst spawns at the ghost delayed replay head, not the live snake head.
- Execution Steps:
  1. Run `npm test -- src/__tests__/ghost-food-burst-delay-position.test.ts`
  2. Validate passing case:
     - `fires exactly 5 seconds after food consumption at ghost delayed replay coordinates, not the live snake head`

## Scenario 5: Rewind snapshot/restore hook availability

- Setup:
  - Use `EchoRewindHook` with `EchoGhost` and `GhostFoodBurstQueue`.
  - Use `MainScene` hook accessors and convenience methods.
  - Take snapshot at state `T`, mutate state, restore to `T`, and re-snapshot.
- Expected Results:
  - Snapshot/restore hooks are present and callable.
  - Hook calls are null-safe across lifecycle states.
  - Restored payloads are stable and deterministic across repeated restore cycles.
- Execution Steps:
  1. Run `npm test -- src/__tests__/rewind-hook.test.ts src/__tests__/main-scene.test.ts`
  2. Validate passing cases:
     - `snapshot at tick T, advance to T+N, restore to T, replay produces same state at T+N`
     - `restore then snapshot produces equivalent payload`
     - `supports snapshot/restore before run start with a stable empty payload`
     - `restores active-run echo state deterministically after mutation`

## Full Validation Sweep

1. Run `npm run build`
2. Run `npm run lint`
3. Run `npm run typecheck`
4. Run `npm test`
