import Game from "@/components/Game";
import GameOver from "@/components/GameOver";
import HUD from "@/components/HUD";
import StartScreen from "@/components/StartScreen";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <section aria-label="Game canvas" className="absolute inset-0 z-0">
        <Game />
      </section>

      <section
        aria-label="Game HUD"
        className="pointer-events-none absolute inset-x-0 top-0 z-20"
      >
        <HUD />
      </section>

      <section
        aria-label="Start menu"
        className="absolute inset-0 z-30 flex items-center justify-center"
      >
        <StartScreen />
      </section>

      <section
        aria-label="Game over menu"
        className="absolute inset-0 z-40 flex items-center justify-center"
      >
        <GameOver />
      </section>
    </main>
  );
}
