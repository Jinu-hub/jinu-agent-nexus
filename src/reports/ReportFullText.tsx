// ─────────────────────────────────────────────────────────────────────────
// ReportFullText — full report markdown on the warm reading page
// ─────────────────────────────────────────────────────────────────────────
//
// Same markdown source as the panel's `ReportArticle`, different typography:
// that one is tuned for a 300px sidebar (11–12px), this reads at article
// size. `##` becomes a warm section rule, `###` an item headline — which is
// how the daily reports are structured (하이라이트 / 주요 항목 / 마무리).
//
// Section chips reuse the panel TOC helpers so a long digest can jump
// without re-implementing slug / scroll logic.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  extractReportSections,
  jumpToSection,
  ReportToc,
} from "@/panels/ReportReader";
import { cn } from "@/lib/utils";

export function ReportFullText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sections = extractReportSections(content);
  const idForTitle = new Map(sections.map((s) => [s.title, s.id]));
  // One chip is just noise; jump only earns its keep with 2+ sections.
  const showToc = sections.length >= 2;

  return (
    <div ref={rootRef} className={cn("mt-8", className)}>
      {showToc ? (
        <ReportToc
          sections={sections}
          onJump={(id) => jumpToSection(rootRef.current, id)}
          className="mb-6"
        />
      ) : null}

      <div
        className={cn(
          "[&>*:first-child]:mt-0",
          // Sticky page header (~2 rows) — land the section title below it.
          "[&_h2]:scroll-mt-28",
          "[&_h2]:mt-12 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-6",
          "[&_h2]:text-[11px] [&_h2]:font-bold [&_h2]:uppercase",
          "[&_h2]:tracking-[0.22em] [&_h2]:text-primary",
          "[&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:leading-snug",
          "[&_h3]:tracking-tight [&_h3]:text-balance",
          "[&_p]:mt-3 [&_p]:text-[15px] [&_p]:leading-7 [&_p]:text-foreground/80",
          "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
          "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
          "[&_li]:text-[15px] [&_li]:leading-7 [&_li]:text-foreground/80",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
          "[&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary",
          "[&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
          // Source markdown puts `-----` before each `##`. Combined with the
          // h2 top border that would draw two parallel rules — keep only h2's.
          "[&_hr]:hidden",
          "[&_table]:mt-4 [&_table]:w-full [&_table]:text-left [&_table]:text-[14px]",
          "[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:font-semibold",
          "[&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:text-foreground/80",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children, ...props }) => {
              const text = flattenText(children);
              const id = idForTitle.get(text);
              return (
                <h2 id={id} {...props}>
                  {children}
                </h2>
              );
            },
            a: (props) => (
              <a
                {...props}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (typeof node === "object" && "props" in node) {
    const el = node as { props?: { children?: ReactNode } };
    return flattenText(el.props?.children);
  }
  return "";
}
