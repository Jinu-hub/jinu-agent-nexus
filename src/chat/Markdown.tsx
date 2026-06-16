import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Thin wrapper so we don't sprinkle remark-gfm across the app. If you
// want to customise rendering (custom <a target="_blank">, syntax
// highlighting, etc.) pass component overrides via `components` here.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-styles text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes("language-");
            return isBlock ? (
              <pre className="paper-inset overflow-x-auto p-3 text-xs">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
