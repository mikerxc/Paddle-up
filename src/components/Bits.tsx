import type { ReactNode } from "react";
import { SKILL_MAX, SKILL_MIN } from "../model.ts";
import { Button } from "./ui/button.tsx";

export function Screen({
  title,
  onBack,
  action,
  children,
}: {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-ink bg-paper px-3 py-3">
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        ) : (
          <p className="text-sm font-black tracking-wide uppercase">Paddle Up</p>
        )}
        <h1 className="min-w-0 flex-1 truncate text-center text-lg font-black">{title}</h1>
        <div className="flex min-w-16 justify-end">{action}</div>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-3 py-3 pb-28">{children}</div>
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  format?: (value: number) => string;
  testId?: string;
}) {
  const text = format ? format(value) : String(value);
  const decimals = step < 1 ? 1 : 0;
  const nudge = (direction: -1 | 1) => {
    const next = Math.round((value + direction * step) * 10) / 10;
    onChange(Math.min(max, Math.max(min, Number(next.toFixed(decimals)))));
  };
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <Button variant="secondary" size="icon" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => nudge(-1)}>
        −
      </Button>
      <p className="min-w-16 flex-1 text-center text-2xl font-black tabular-nums">{text}</p>
      <Button variant="secondary" size="icon" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => nudge(1)}>
        +
      </Button>
    </div>
  );
}

export function SkillStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const quick = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="lg" className="w-20 text-3xl" aria-label="Lower skill" onClick={() => onChange(Math.max(SKILL_MIN, Math.round((value - 0.1) * 10) / 10))}>
          −
        </Button>
        <p className="text-5xl font-black tabular-nums" data-testid="skill-value">
          {value.toFixed(1)}
        </p>
        <Button variant="secondary" size="lg" className="w-20 text-3xl" aria-label="Raise skill" onClick={() => onChange(Math.min(SKILL_MAX, Math.round((value + 0.1) * 10) / 10))}>
          +
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {quick.map((skill) => (
          <Button key={skill} variant={skill === value ? "default" : "secondary"} onClick={() => onChange(skill)}>
            {skill.toFixed(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}
