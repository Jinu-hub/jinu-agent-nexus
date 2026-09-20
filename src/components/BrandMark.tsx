import { cn } from "@/lib/utils";

/**
 * DAMI brand mark — custom D with a 4-point sparkle in the counter.
 * Sync path geometry with `public/favicon.svg`.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid size-7 place-items-center rounded-md border border-border bg-card text-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[66%]"
      >
        {/* Stem */}
        <path d="M10.5 7.5 V24.5" />
        {/* Bowl */}
        <path d="M10.5 7.5 H14.2 C21.2 7.5 25 11.2 25 16 C25 20.8 21.2 24.5 14.2 24.5 H10.5" />
        {/* 4-point sparkle (filled) */}
        <path
          d="M17.2 12.6 L18.15 15.25 L20.9 16.2 L18.15 17.15 L17.2 19.8 L16.25 17.15 L13.5 16.2 L16.25 15.25 Z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    </div>
  );
}
