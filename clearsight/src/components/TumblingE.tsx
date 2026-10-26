import type { Direction } from "@/lib/vision";

const ROTATION: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 };

export function TumblingE({ sizePx, dir }: { sizePx: number; dir: Direction }) {
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Letter E"
      style={{ transform: `rotate(${ROTATION[dir]}deg)` }}
    >
      <rect x="0" y="0" width="1" height="5" fill="#000" />
      <rect x="0" y="0" width="5" height="1" fill="#000" />
      <rect x="0" y="2" width="5" height="1" fill="#000" />
      <rect x="0" y="4" width="5" height="1" fill="#000" />
    </svg>
  );
}
