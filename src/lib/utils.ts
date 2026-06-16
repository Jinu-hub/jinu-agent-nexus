// `cn` — class name composer used by every component.
//
// `clsx` filters falsy values out of a class list (so you can write
// `cn("base", isActive && "ring-2")`). `tailwind-merge` resolves
// conflicting Tailwind utilities (so `cn("p-2", "p-4")` becomes
// `"p-4"`). Same exact helper shadcn ships.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
