import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger" | "prod"; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-accent text-white shadow-sm shadow-indigo-950/25 hover:bg-accent-2",
        variant === "ghost" && "text-foreground hover-surface",
        variant === "outline" && "border border-line bg-transparent hover-surface",
        variant === "danger" && "bg-rose-500 text-white hover:bg-rose-400",
        variant === "prod" && "bg-amber-500 text-zinc-950 hover:bg-amber-400",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm text-foreground outline-none focus:border-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-muted", className)}>{children}</label>;
}

export function Card({ children, className, ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-xl border border-line bg-panel p-4 text-foreground shadow-sm shadow-black/10 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium capitalize text-foreground", className)}>
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-inset", className)} />;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  closeOnBackdrop = true,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** When false, clicking outside does not close (use for required flows). */
  closeOnBackdrop?: boolean;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4",
        className,
      )}
      style={{ background: "var(--color-overlay)" }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto border border-line bg-panel p-4 text-foreground sm:max-h-[90vh] sm:rounded-xl sm:p-6",
          "rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="min-w-0 flex-1 pr-3 text-base font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: "danger" | "prod";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={tone === "prod" ? "prod" : "danger"} className="w-full sm:w-auto" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
