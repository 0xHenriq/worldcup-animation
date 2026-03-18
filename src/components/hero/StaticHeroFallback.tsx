import Image from "next/image";

const HERO_IMAGE_WIDTH = 1920;
const HERO_IMAGE_HEIGHT = 1080;
const TROPHY_IMAGE_WIDTH = 1200;
const TROPHY_IMAGE_HEIGHT = 670;
const CTA_PRIMARY_HREF = "#tickets";
const CTA_SECONDARY_HREF = "#hospitality";

export type StaticHeroFallbackProps = {
  className?: string;
};

export default function StaticHeroFallback({
  className,
}: StaticHeroFallbackProps) {
  const rootClassName = [
    "hero-static relative flex flex-col bg-black text-white",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} data-branch="static">
      <Image
        alt=""
        aria-hidden="true"
        className="h-auto w-full object-cover object-center"
        decoding="async"
        fetchPriority="high"
        height={HERO_IMAGE_HEIGHT}
        priority
        sizes="100vw"
        src="/hero/portal-composite.webp"
        width={HERO_IMAGE_WIDTH}
      />

      <Image
        alt=""
        aria-hidden="true"
        className="h-auto w-full object-cover object-center"
        decoding="async"
        height={HERO_IMAGE_HEIGHT}
        sizes="100vw"
        src="/hero/stadium-poster.webp"
        width={HERO_IMAGE_WIDTH}
      />

      <div className="flex flex-col items-center gap-8 px-6 py-12 text-center sm:px-8 sm:py-16">
        <div className="w-full max-w-[20rem] sm:max-w-[22rem]">
          <Image
            alt="FIFA World Cup 2026 Trophy"
            className="h-auto w-full object-contain"
            decoding="async"
            height={TROPHY_IMAGE_HEIGHT}
            loading="lazy"
            sizes="(min-width: 640px) 22rem, 80vw"
            src="/hero/trophy.webp"
            width={TROPHY_IMAGE_WIDTH}
          />
        </div>

        <div className="flex w-full max-w-[20rem] flex-col items-center gap-3">
          <a
            className="w-full rounded-full border border-transparent bg-[var(--hero-color-gold)] px-6 py-3 text-base font-semibold text-black transition-[background,box-shadow,transform] duration-200 hover:bg-[linear-gradient(135deg,var(--hero-color-gold)_0%,var(--hero-color-gold-light)_100%)] hover:shadow-[0_12px_30px_rgba(201,168,76,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-color-gold-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            href={CTA_PRIMARY_HREF}
          >
            Take Your Seat
          </a>
          <a
            className="text-sm font-medium tracking-[0.18em] text-white/84 uppercase transition-colors duration-200 hover:text-[var(--hero-color-gold-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-color-gold-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            href={CTA_SECONDARY_HREF}
          >
            Explore Hospitality
          </a>
        </div>
      </div>
    </div>
  );
}
