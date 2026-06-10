import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CTAItem } from '@/lib/home-content';

/** Page-level docs-inspired light surface used across the landing page. */
export function LandingSurface({ children }: { children: ReactNode }) {
  return (
    <div className="landing-docs-surface relative isolate bg-[#f8fafc] text-slate-950">
      <div className="relative">{children}</div>
    </div>
  );
}

export function SectionContainer({
  children,
  className,
  size = 'default',
  id,
}: {
  children: ReactNode;
  className?: string;
  size?: 'default' | 'wide' | 'narrow';
  id?: string;
}) {
  const maxWidth =
    size === 'wide' ? 'max-w-[1280px]' : size === 'narrow' ? 'max-w-4xl' : 'max-w-6xl';
  return (
    <section
      id={id}
      className={cn(
        'relative mx-auto w-full px-6 py-20 md:px-8 md:py-28 lg:px-10 lg:py-32',
        maxWidth,
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center mx-auto max-w-3xl' : 'items-start',
        className,
      )}
    >
      {eyebrow && (
        <span className="inline-flex items-center rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-700 uppercase">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description && (
        <p className="text-base leading-relaxed text-slate-600 md:text-lg">{description}</p>
      )}
    </div>
  );
}

function CTALink({
  cta,
  variant,
}: {
  cta: CTAItem;
  variant: 'primary' | 'secondary' | 'ghost';
}) {
  const base =
    'inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-semibold transition-all';
  const styles =
    variant === 'primary'
      ? 'bg-slate-950 text-slate-50 shadow-sm hover:bg-slate-800'
      : variant === 'secondary'
      ? 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50'
      : 'text-slate-600 hover:text-slate-950';
  return (
    <Link to={cta.href} className={cn(base, styles)}>
      {cta.label}
    </Link>
  );
}

export function CTAButtons({
  primary,
  secondary,
  tertiary,
  align = 'left',
  className,
}: {
  primary?: CTAItem;
  secondary?: CTAItem;
  tertiary?: CTAItem;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-3',
        align === 'center' ? 'justify-center' : 'justify-start',
        className,
      )}
    >
      {primary && <CTALink cta={primary} variant="primary" />}
      {secondary && <CTALink cta={secondary} variant="secondary" />}
      {tertiary && <CTALink cta={tertiary} variant="ghost" />}
    </div>
  );
}

export function TagChip({
  label,
  variant = 'default',
}: {
  label: string;
  variant?: 'default' | 'accent' | 'outline';
}) {
  const styles =
    variant === 'accent'
      ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
      : variant === 'outline'
      ? 'border border-slate-200 bg-white text-slate-600'
      : 'border border-slate-200 bg-white text-slate-600';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide',
        styles,
      )}
    >
      {label}
    </span>
  );
}

export function GlassCard({
  children,
  className,
  hoverable = true,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-6 md:p-8',
        'shadow-sm',
        hoverable &&
          'transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FeatureCard({
  title,
  description,
  icon,
  tag,
  className,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  tag?: string;
  className?: string;
}) {
  return (
    <GlassCard className={cn('flex flex-col gap-4', className)}>
      {(icon || tag) && (
        <div className="flex items-center justify-between">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-200 bg-cyan-50 text-cyan-700">
              {icon}
            </div>
          )}
          {tag && <TagChip label={tag} variant="accent" />}
        </div>
      )}
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600 md:text-base">{description}</p>
    </GlassCard>
  );
}

/** Lightweight UI mock panel header label. */
export function MockPanel({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-4 shadow-sm',
        className,
      )}
    >
      {label && (
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-red-400/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/70" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          <span className="ml-2 font-mono tracking-wide">{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}
