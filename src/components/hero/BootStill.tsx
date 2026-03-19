import type { CSSProperties } from "react";
import Image from "next/image";

export type BootStillProps = {
  className?: string;
  style?: CSSProperties;
};

export default function BootStill({ className, style }: BootStillProps) {
  const rootClassName = [
    "pointer-events-none absolute inset-0 overflow-hidden",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div aria-hidden="true" className={rootClassName} data-layer="boot-still" style={style}>
      <Image
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
        decoding="async"
        fetchPriority="high"
        height={1080}
        loading="eager"
        priority
        src="/hero/portal-composite.webp"
        unoptimized
        width={1920}
      />
    </div>
  );
}
