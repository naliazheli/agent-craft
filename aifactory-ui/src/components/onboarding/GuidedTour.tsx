import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type GuidedTourStep = {
  selector: string;
  title: string;
  body: string;
  actionLabel?: string;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const CARD_WIDTH = 360;
const VIEWPORT_PADDING = 16;
const TARGET_ADVANCE_DELAY_MS = 180;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getInitialOpen(storageKey: string, autoStart = true) {
  if (!autoStart || typeof window === 'undefined') return false;
  return window.localStorage.getItem(storageKey) !== 'done';
}

export function GuidedTour({
  steps,
  storageKey,
  startLabel = 'Guide',
  autoStart = true,
  onStepChange,
}: {
  steps: GuidedTourStep[];
  storageKey: string;
  startLabel?: string;
  autoStart?: boolean;
  onStepChange?: (step: GuidedTourStep, index: number) => void;
}) {
  const [open, setOpen] = useState(() => getInitialOpen(storageKey, autoStart));
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const current = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const advanceTour = useCallback(() => {
    if (isLastStep) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, 'done');
      }
      setOpen(false);
      return;
    }
    setStepIndex((value) => Math.min(steps.length - 1, value + 1));
  }, [isLastStep, steps.length, storageKey]);

  useEffect(() => {
    if (open && current) {
      onStepChange?.(current, stepIndex);
    }
  }, [current, onStepChange, open, stepIndex]);

  const measureTarget = useCallback(() => {
    if (!open || !current || typeof document === 'undefined') return;
    const target = document.querySelector<HTMLElement>(current.selector);
    if (!target) {
      setTargetRect(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [current, open]);

  useEffect(() => {
    if (!open || !current || typeof document === 'undefined') return;
    const target = document.querySelector<HTMLElement>(current.selector);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    const timers = [
      window.setTimeout(measureTarget, 80),
      window.setTimeout(measureTarget, 360),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [current, measureTarget, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTour(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [measureTarget, open]);

  useEffect(() => {
    if (!open || !current || typeof document === 'undefined') return;

    const handleTargetClick = (event: MouseEvent) => {
      const target = document.querySelector<HTMLElement>(current.selector);
      if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return;
      window.setTimeout(advanceTour, TARGET_ADVANCE_DELAY_MS);
    };

    document.addEventListener('click', handleTargetClick, true);
    return () => document.removeEventListener('click', handleTargetClick, true);
  }, [advanceTour, current, open]);

  const closeTour = (remember: boolean) => {
    if (remember && typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, 'done');
    }
    setOpen(false);
  };

  const restart = () => {
    setStepIndex(0);
    setOpen(true);
  };

  const cardPosition = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') {
      return {
        top: VIEWPORT_PADDING,
        left: VIEWPORT_PADDING,
      };
    }

    const canPlaceRight = targetRect.left + targetRect.width + CARD_WIDTH + 32 < window.innerWidth;
    const canPlaceLeft = targetRect.left - CARD_WIDTH - 32 > 0;
    if (canPlaceRight || canPlaceLeft) {
      const left = canPlaceRight
        ? targetRect.left + targetRect.width + 18
        : targetRect.left - CARD_WIDTH - 18;
      return {
        top: clamp(targetRect.top, VIEWPORT_PADDING, window.innerHeight - 260),
        left,
      };
    }
    const canPlaceBelow = targetRect.top + targetRect.height + 300 < window.innerHeight;
    const top = canPlaceBelow
      ? targetRect.top + targetRect.height + 18
      : Math.max(VIEWPORT_PADDING, targetRect.top - 278);
    const left = clamp(
      targetRect.left + (targetRect.width - CARD_WIDTH) / 2,
      VIEWPORT_PADDING,
      window.innerWidth - CARD_WIDTH - VIEWPORT_PADDING,
    );
    return { top, left };
  }, [targetRect]);

  const highlightStyle = targetRect
    ? {
        top: targetRect.top - 8,
        left: targetRect.left - 8,
        width: targetRect.width + 16,
        height: targetRect.height + 16,
      }
    : undefined;

  return (
    <>
      {!open && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="fixed right-5 top-20 z-40 gap-2 rounded-full shadow-lg"
          onClick={restart}
        >
          <HelpCircle className="h-4 w-4" />
          {startLabel}
        </Button>
      )}

      {open && current && (
        <div className="fixed inset-0 z-[70] pointer-events-none">
          <div className="pointer-events-none absolute inset-0 bg-background/32" />

          {highlightStyle && (
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-cyan-300 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.24),0_0_0_6px_rgba(34,211,238,0.14),0_0_32px_rgba(34,211,238,0.36)] transition-all"
              style={highlightStyle}
            />
          )}

          <div
            className="pointer-events-auto absolute w-[calc(100vw-2rem)] max-w-[360px] rounded-xl border bg-card p-4 shadow-2xl"
            style={cardPosition}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {stepIndex + 1} of {steps.length}
                </p>
                <h3 className="text-base font-semibold">{current.title}</h3>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => closeTour(true)}
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">{current.body}</p>
            {current.actionLabel && (
              <p className="mt-3 rounded-md border bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                {current.actionLabel}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => closeTour(true)}
              >
                Skip
              </button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn(stepIndex === steps.length - 1 && 'px-4')}
                  onClick={advanceTour}
                >
                  {stepIndex === steps.length - 1 ? 'Done' : <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
