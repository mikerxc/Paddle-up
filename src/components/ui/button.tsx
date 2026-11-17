import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink text-center font-bold leading-tight select-none transition-transform active:translate-y-px disabled:opacity-45 focus-visible:outline-none",
  {
    variants: {
      variant: {
        default: "bg-court text-white",
        secondary: "bg-card text-ink",
        yellow: "bg-ball text-ink",
        clay: "bg-clay text-white",
        ghost: "border-transparent bg-transparent text-ink",
      },
      size: {
        default: "min-h-12 px-4 py-2 text-base",
        lg: "min-h-14 px-4 py-3 text-lg",
        icon: "h-12 w-12 text-2xl",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      full: false,
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, full, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, full }), className)} type={asChild ? undefined : type} {...props} />;
}
