# Echo Ghost Validation Plan and Coverage Matrix

**Task**: #7 Add validation coverage and test-plan artifacts for echo ghost behavior
**Owner**: Agent Aaron
**Date**: 2026-02-14

## Scope

This plan validates the five required Echo Ghost behaviors from Phase 3 specs:

1. 5-second delay accuracy
2. Fade-out and replay completion lifecycle
3. Collision fatality parity with self-collision
4. Delayed ghost-food burst timing
5. Rewind hook availability (snapshot/restore integration)

## Automated Coverage Matrix

| ID | Behavior | Automated test(s) |
| --- | --- | --- |
| EG-VAL-01 | 5-second delay accuracy | `src/__tests__/echo-ghost.test.ts` - `replays recorded path on a 5-second delay` |
| EG-VAL-02 | Fade-out/replay completion | `src/__tests__/echo-ghost.test.ts` - `consumes buffered playback after stop and fades out when exhausted` |
| EG-VAL-03 | Collision fatality parity | `src/__tests__/main-scene.test.ts` - `matches self-collision fatality side effects (parity with echo-collision)` |
| EG-VAL-04 | Delayed burst timing | `src/__tests__/main-scene.test.ts` - `queues a delayed ghost-food burst exactly 5 seconds after food is eaten` |
| EG-VAL-05 | Rewind hook availability | `src/__tests__/echo-ghost.test.ts` - `supports rewind snapshots via createSnapshot/restoreSnapshot`; `src/__tests__/main-scene.test.ts` - `exposes rewind hooks to snapshot/restore EchoGhost state` |

## Manual Validation Checklist

- Start a run and survive longer than 5 seconds.
- Confirm ghost replay does not appear before 5 seconds and starts immediately after the delay threshold.
- Stop recording conditions (death/restart) and verify the ghost finishes replaying buffered history, then fades out fully.
- Trigger a self-collision and separately trigger an echo-ghost collision; verify both produce the same game-over behavior (snake dies, run ends, game-over phase/overlay).
- Eat food and verify a matching cosmetic burst appears at the ghost-corresponding position after a 5-second delay.
- Capture and restore EchoGhost snapshot state via scene rewind hooks and verify ghost buffer/timing state is restored.

## Validation Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Latest Execution Result

- Date: 2026-02-14
- Status: PASS
- Notes: Lint, typecheck, full Vitest suite, and production build all completed successfully.
