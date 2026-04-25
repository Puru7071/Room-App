import { AuthGateForms } from "@/components/client/home/AuthGateForms";
import { HomeFeatureCards } from "@/components/home/HomeFeatureCards";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { AmbientPageBackground } from "@/components/layout/AmbientPageBackground";

export default function Home() {
  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <AmbientPageBackground mouseShadow />

      <HomeHeader />

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden py-2 px-4 sm:px-8">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden py-2 sm:gap-7 sm:py-3">
          <div className="w-full max-w-3xl shrink-0">
            <HomeHero />
          </div>
          <div className="flex w-full max-w-[min(100%,80rem)] justify-center px-1 sm:px-0">
            <AuthGateForms />
          </div>
          <HomeFeatureCards />
        </div>
      </main>
    </div>
  );
}
