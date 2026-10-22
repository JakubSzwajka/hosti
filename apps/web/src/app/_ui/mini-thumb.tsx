import { bars } from "@/app/_ui/pieces";

export function MiniThumb({ seed, live }: { seed: string; live: boolean }) {
  if (!live) return <span className="mini" data-dead="" aria-hidden="true" />;
  return (
    <span className="mini" aria-hidden="true">
      {bars(seed, 6).map((bar) => (
        <i key={bar.id} style={{ height: `${Math.round(bar.height / 3)}px` }} />
      ))}
    </span>
  );
}
