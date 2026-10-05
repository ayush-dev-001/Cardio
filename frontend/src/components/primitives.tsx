/**
 * shadcn-style UI primitives (Radix UI + Tailwind), styled for the CardioScope dashboard:
 * near-black surfaces, purple accent, visible focus, 44px touch targets on mobile.
 */
import { Accordion as A, Dialog as D, Select as S, Slider as Sl, Switch as Sw, Tooltip as T } from "radix-ui";
import { Check, ChevronDown, Info, X } from "lucide-react";
import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../lib/cn";

// ------------------------------------------------------------------------------- card
export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("card-surface rounded-2xl", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-brand-300">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate font-manrope text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="truncate text-xs text-white/50">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------------------- button
type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "icon";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary-hover",
  secondary: "bg-white/[0.06] text-white/90 border border-white/10 hover:bg-white/[0.1] hover:text-white",
  ghost: "text-white/70 hover:bg-white/[0.06] hover:text-white",
  outline: "border border-white/15 text-white/85 hover:border-white/30 hover:text-white",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  icon: "h-11 w-11 sm:h-10 sm:w-10",
};

export const Button = forwardRef<HTMLButtonElement, HTMLMotionProps<"button"> & { variant?: Variant; size?: Size }>(
  function Button({ variant = "secondary", size = "md", className, ...props }, ref) {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.97 }}
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 rounded-lg font-manrope font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      />
    );
  },
);

// ------------------------------------------------------------------------------- tooltip
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={250}>{children}</T.Provider>;
}

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-[70] max-w-64 rounded-lg border border-white/10 bg-[#16131f] px-3 py-2 text-xs leading-relaxed text-white/85 shadow-xl shadow-black/50 data-[state=delayed-open]:animate-[pop-in_160ms_ease-out]"
        >
          {content}
          <T.Arrow className="fill-[#16131f]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/** Small (i) button that explains a field: hover/focus on desktop, tap to toggle on touch screens. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <T.Root open={open} onOpenChange={setOpen}>
      <T.Trigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          onClick={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
          className="relative grid h-5 w-5 place-items-center rounded-full text-white/35 transition-colors before:absolute before:-inset-2.5 before:content-[''] hover:text-white/80"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </T.Trigger>
      <T.Portal>
        <T.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          onPointerDownOutside={() => setOpen(false)}
          className="z-[70] max-w-64 rounded-lg border border-white/10 bg-[#16131f] px-3 py-2 text-xs leading-relaxed text-white/85 shadow-xl shadow-black/50 data-[state=delayed-open]:animate-[pop-in_160ms_ease-out] data-[state=instant-open]:animate-[pop-in_160ms_ease-out]"
        >
          {text}
          <T.Arrow className="fill-[#16131f]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

// ------------------------------------------------------------------------------- accordion
export const Accordion = A.Root;

export function AccordionItem({ value, header, children, className }: { value: string; header: ReactNode; children: ReactNode; className?: string }) {
  return (
    <A.Item value={value} className={cn("card-surface overflow-hidden rounded-xl", className)}>
      <A.Header>
        <A.Trigger className="group flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]">
          {header}
          <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
        </A.Trigger>
      </A.Header>
      <A.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3.5">{children}</div>
      </A.Content>
    </A.Item>
  );
}

// ------------------------------------------------------------------------------- switch
export function Switch({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Sw.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 shrink-0 rounded-full border border-white/10 bg-white/10 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <Sw.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-[21px]" />
      </Sw.Root>
      <label htmlFor={id} className="font-manrope text-xs font-medium text-white/80">
        {label}
      </label>
    </span>
  );
}

// ------------------------------------------------------------------------------- slider
export function Slider({ value, min, max, step, onValueChange, label, marker }: {
  value: number; min: number; max: number; step: number; onValueChange: (v: number) => void; label: string; marker?: number | null;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <Sl.Root
      value={[Math.min(max, Math.max(min, value))]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v[0])}
      aria-label={label}
      className="relative flex h-7 w-full touch-none select-none items-center"
    >
      <Sl.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/10">
        <Sl.Range className="absolute h-full rounded-full bg-gradient-to-r from-primary/70 to-primary" />
      </Sl.Track>
      {marker != null && (
        <span
          aria-hidden
          title="Baseline"
          className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-white/60"
          style={{ left: `${pct(marker)}%` }}
        />
      )}
      <Sl.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-white shadow-lg shadow-primary/40 transition-transform hover:scale-110" />
    </Sl.Root>
  );
}

// ------------------------------------------------------------------------------- select
export function Select({ value, onValueChange, options, id, invalid }: {
  value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; id: string; invalid?: boolean;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger
        id={id}
        aria-invalid={invalid}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border bg-surface-2 px-3 text-left font-manrope text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/30",
          invalid ? "border-red-500/80" : "border-white/10",
        )}
      >
        <S.Value />
        <S.Icon>
          <ChevronDown className="h-4 w-4 text-white/40" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-white/10 bg-[#14111d] p-1 shadow-2xl shadow-black/60 data-[state=open]:animate-[pop-in_140ms_ease-out]"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 font-manrope text-sm text-white/80 outline-none data-[highlighted]:bg-primary/20 data-[highlighted]:text-white"
              >
                <S.ItemIndicator className="absolute left-2.5">
                  <Check className="h-4 w-4 text-brand-300" aria-hidden />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

// ------------------------------------------------------------------------------- sheet (mobile menu)
export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm data-[state=closed]:animate-[fade-out_160ms] data-[state=open]:animate-[fade-in_200ms]" />
        <D.Content className="fixed inset-y-0 right-0 z-[61] flex w-[min(86vw,360px)] flex-col border-l border-white/10 bg-surface p-5 shadow-2xl data-[state=closed]:animate-[sheet-out-right_200ms_ease-in] data-[state=open]:animate-[sheet-in-right_260ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="flex items-center justify-between">
            <D.Title className="font-serif text-2xl text-white">{title}</D.Title>
            <D.Close className="grid h-11 w-11 place-items-center rounded-lg text-white/70 hover:bg-white/[0.06] hover:text-white" aria-label="Close menu">
              <X className="h-5 w-5" aria-hidden />
            </D.Close>
          </div>
          <D.Description className="sr-only">Navigation and view settings</D.Description>
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ------------------------------------------------------------------------------- skeleton + empty state
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden />;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-surface-2 text-brand-300">
        <span aria-hidden className="absolute inset-0 -z-10 rounded-2xl bg-primary/25 blur-xl" />
        {icon}
      </div>
      <h3 className="font-serif text-2xl text-white">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
