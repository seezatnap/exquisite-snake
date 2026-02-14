# Specifications: snake-phase3-echo-r2-followups

# Snake Phase 3 Echo Ghost — try4 Followup

Continue from branch `feature/snake-phase3-echo-try4` which has tasks #1–#6 complete.

## Remaining Work

### Task: Validation Coverage & Test Plan Artifacts

Add validation coverage and test plan artifacts for key echo ghost behavior:

- **5-second delay accuracy**: Verify the ghost trail replays the snake path with exactly a 5-second delay
- **Fade-out/replay completion**: Verify the ghost stops and fades when buffered history is consumed
- **Collision fatality parity**: Verify contact with the ghost triggers game-over via the same self-collision path
- **Delayed burst timing**: Verify the cosmetic food burst fires at the correct ghost position 5 seconds after food is eaten
- **Rewind hook availability**: Verify snapshot/restore hooks exist and are callable for future Phase 6 integration

All test files should be placed in `src/__tests__/` following existing patterns. Use the existing test infrastructure (Vitest).

