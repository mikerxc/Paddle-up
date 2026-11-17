import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/60" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-3xl border-2 border-ink bg-card focus:outline-none">
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
            <DialogPrimitive.Title className="text-xl font-black">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="min-h-12 min-w-16 rounded-xl border-2 border-ink bg-ball px-3 text-base font-bold">
              Close
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="px-4 pt-3 text-base font-semibold text-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="overflow-y-auto px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
