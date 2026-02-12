type HUDProps = Readonly<{
  score?: number;
  highScore?: number;
  biomeLabel?: string;
  rewindStatus?: string;
  parasiteStatus?: string;
}>;

type StatusSlotProps = Readonly<{
  label: string;
  value: string;
}>;

function formatCounter(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }

  return Math.max(0, Math.floor(value)).toString();
}

function StatusSlot({ label, value }: StatusSlotProps) {
  return (
    <div className="rounded-lg border border-neon-cyan/25 bg-surface-0/65 px-2 py-1">
      <p className="text-[0.58rem] text-neon-cyan/65">{label}</p>
      <p className="mt-0.5 font-mono text-[0.68rem] text-foreground/85">{value}</p>
    </div>
  );
}

export default function HUD({
  score = 0,
  highScore = 0,
  biomeLabel = "pending",
  rewindStatus = "pending",
  parasiteStatus = "empty",
}: HUDProps) {
  const displayScore = formatCounter(score);
  const displayHighScore = formatCounter(highScore);

  return (
    <aside
      aria-label="Heads-up display"
      className="mx-auto max-w-6xl rounded-2xl border border-neon-cyan/40 bg-surface-1/78 px-3 py-2 shadow-[0_0_20px_rgb(var(--neon-cyan-rgb)/0.14)] backdrop-blur-sm sm:px-4 sm:py-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-5 sm:gap-8">
          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-neon-cyan/70">
              Score
            </p>
            <p className="font-mono text-xl leading-none text-foreground sm:text-2xl">
              {displayScore}
            </p>
          </div>

          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-neon-cyan/70">
              High Score
            </p>
            <p className="font-mono text-lg leading-none text-neon-pink sm:text-xl">
              {displayHighScore}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[0.58rem] uppercase tracking-[0.16em] sm:gap-3">
          <StatusSlot label="Biome" value={biomeLabel} />
          <StatusSlot label="Rewind" value={rewindStatus} />
          <StatusSlot label="Parasites" value={parasiteStatus} />
        </div>
      </div>
    </aside>
  );
}
