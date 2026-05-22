import { type ClassValue, clsx } from "clsx";

/**
 * Utility for merging Tailwind CSS classes conditionally.
 * Handles class conflicts and produces a clean className string.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
