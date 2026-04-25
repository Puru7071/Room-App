import { APP_DISPLAY_NAME } from "@/lib/app-constants";

export function HomeHero() {
  return (
    <div className="flex min-h-0 w-full max-w-3xl flex-col items-center gap-4 text-center sm:gap-5">
      <h1 className="w-full text-2xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl">
        One room for{" "}
        <span className="text-accent-blue">YouTube</span>
        {" "}
        with everyone.<br/> Hangout, Study or Jam<span aria-hidden>✨</span>
      </h1>
      <p className="max-w-xl text-sm font-[500] leading-relaxed text-muted sm:text-base">
        {APP_DISPLAY_NAME} keeps friends, classmates, or coworkers on the same
        video and timeline—stand-up nights, playlists, breaking news, lectures, or
        a scroll of dumb clips-without losing the thread in chat.
      </p>
    </div>
  );
}
