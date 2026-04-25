import Image from "next/image";
import Link from "next/link";
import { HomeHeaderActions } from "@/components/client/home/HomeHeaderActions";
import { APP_DISPLAY_NAME } from "@/lib/app-constants";

export function HomeHeader() {
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:h-16 sm:px-8">
      <Link
        href="/"
        tabIndex={-1}
        className="flex shrink-0 items-center gap-4 rounded-lg outline-none ring-accent-blue/40 focus-visible:ring-2"
      >
        <div 
          className="p-0.5 py-0 bg-white rounded-sm"
        >
        <Image
          src="/logo-mark.png"
          alt=""
          width={36}
          height={36}
          className="h-8 w-8 object-contain"
          unoptimized
          aria-hidden={true}
        />

        </div>
        <span className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {APP_DISPLAY_NAME}
        </span>
      </Link>

      <div className="flex flex-row items-center gap-3 sm:gap-4">
        <HomeHeaderActions />
      </div>
    </header>
  );
}
