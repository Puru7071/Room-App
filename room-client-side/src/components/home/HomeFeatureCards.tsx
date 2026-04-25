import Image from "next/image";
import { HOME_FEATURE_CARDS } from "@/data/home-feature-cards";

const cardGridCols =
  "sm:grid-cols-[minmax(0,0.62fr)_minmax(0,0.92fr)_minmax(0,0.62fr)]";

export function HomeFeatureCards() {
  return (
    <div
      className={`relative -top-3 mx-auto -mt-4 grid w-full max-w-4xl grid-cols-1 items-center sm:-top-6 ${cardGridCols} gap-12 sm:gap-6 md:gap-10`}
    >
      {HOME_FEATURE_CARDS.map((item, index) => {
        const isCenter = index === 1;
        /** Fixed height (not max-height) reserves the strip before the PNG decodes — avoids width “breathe”. */
        const textStripH = isCenter
          ? "h-12 sm:h-12 md:h-14"
          : "h-11 sm:h-11 md:h-12";
        return (
          <article
            key={item.src}
            className={`flex min-w-0 cursor-pointer flex-col items-stretch gap-2.5 overflow-hidden rounded-2xl border border-border bg-card pb-2 ring-1 ring-foreground/5 sm:gap-3 ${
              isCenter
                ? "shadow-[0_16px_48px_-12px_rgba(15,23,42,0.14),0_4px_20px_-6px_rgba(15,23,42,0.08)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45),0_4px_20px_-6px_rgba(0,0,0,0.25)] sm:shadow-[0_22px_56px_-14px_rgba(15,23,42,0.16),0_8px_24px_-8px_rgba(15,23,42,0.1)] dark:sm:shadow-[0_22px_56px_-14px_rgba(0,0,0,0.5),0_8px_24px_-8px_rgba(0,0,0,0.28)]"
                : "shadow-[0_10px_36px_-10px_rgba(15,23,42,0.1),0_4px_14px_-6px_rgba(15,23,42,0.05)] dark:shadow-[0_10px_36px_-10px_rgba(0,0,0,0.35),0_4px_14px_-6px_rgba(0,0,0,0.2)]"
            }`}
          >
            <div
              className={`flex min-w-0 flex-col overflow-hidden bg-transparent`}
            >
              <div
                className={`group relative w-full overflow-hidden bg-muted/20 ${
                  isCenter ? "aspect-16/10 sm:aspect-5/3" : "aspect-16/10"
                }`}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={item.cardWidth}
                  height={item.cardHeight}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 400px"
                  priority
                  className="h-full w-full origin-center object-cover bg-card backface-hidden transform-gpu transition-transform duration-800 ease-[cubic-bezier(0.45,0.05,0.25,1)] group-hover:scale-[1.045] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>
            </div>

            <div
              className={`relative flex w-full min-w-0 shrink-0 items-center justify-center overflow-hidden px-0.5 ${textStripH}`}
            >
              <Image
                src={item.textSrc}
                alt={item.textAlt}
                width={item.textWidth}
                height={item.textHeight}
                unoptimized
                priority
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 32vw, 280px"
                className="max-h-full w-auto max-w-full object-contain object-bottom"
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
