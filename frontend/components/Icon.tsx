import type { CSSProperties } from "react";

interface IconProps {
  /** Symbol id from <IconSprite />, e.g. "ic-map", "ic-fire". */
  name: string;
  className?: string;
  style?: CSSProperties;
}

// Stroke icon rendered from the shared sprite. The base ".i" class carries the mockup's
// stroke styling; callers append classes or inline styles for per-context sizing.
export default function Icon({ name, className, style }: IconProps) {
  return (
    <svg className={className ? `i ${className}` : "i"} style={style} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
