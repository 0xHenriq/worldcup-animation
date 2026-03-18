const FILM_GRAIN_FILTER_ID = "hero-film-grain-filter";

export default function FilmGrain() {
  return (
    <svg
      aria-hidden="true"
      className="hero-grain-shift pointer-events-none h-full w-full opacity-[0.04]"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <defs>
        <filter id={FILM_GRAIN_FILTER_ID} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            baseFrequency="1.2"
            numOctaves="2"
            result="noise"
            seed="11"
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix in="noise" result="grain" type="saturate" values="0" />
          <feComponentTransfer in="grain" result="grain-alpha">
            <feFuncA tableValues="0 0.18" type="table" />
          </feComponentTransfer>
          <feComposite in="grain-alpha" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      <rect
        fill="white"
        filter={`url(#${FILM_GRAIN_FILTER_ID})`}
        height="100"
        width="100"
        x="0"
        y="0"
      />
    </svg>
  );
}
