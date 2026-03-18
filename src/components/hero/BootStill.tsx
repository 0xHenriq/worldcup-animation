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
        className="object-cover object-center"
        decoding="async"
        fill
        priority
        sizes="100vw"
        src="/hero/portal-composite.webp"
      />
    </div>
  );
}
