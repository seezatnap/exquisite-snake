import Game from "@/components/Game";
import GameOver from "@/components/GameOver";
import HUD from "@/components/HUD";
import StartScreen from "@/components/StartScreen";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden px-2 py-3 sm:px-4 sm:py-5 lg:px-8 lg:py-8">
      <section
        aria-label="Game canvas"
        className="arena-floor absolute inset-0 z-0 sm:inset-1 lg:inset-2"
      >
        <Game />
      </section>

      <section
        aria-label="Game HUD"
        className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-7 sm:pt-6 lg:px-10"
      >
        <HUD />
      </section>

      <section
        aria-label="Start menu"
        className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 lg:p-10"
      >
        <StartScreen />
      </section>

      <section
        aria-label="Game over menu"
        className="absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6 lg:p-10"
      >
        <GameOver />
      </section>
    </main>
  );
}
