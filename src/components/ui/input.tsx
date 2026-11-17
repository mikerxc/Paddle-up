import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-14 w-full rounded-xl border-2 border-ink bg-card px-3 text-lg font-bold text-ink placeholder:font-semibold placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}
