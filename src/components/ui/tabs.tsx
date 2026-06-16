// Thin wrapper around Radix Tabs with shadcn-flavored styling.
//
// `radix-ui` is the meta-package; each primitive (Tabs, ScrollArea,
// Separator, Slot, …) is re-exported as a namespace. So
// `Tabs.Root / Tabs.List / Tabs.Trigger / Tabs.Content` are accessed
// via the namespace.
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_0_var(--primary)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "flex-1 overflow-auto p-4 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
