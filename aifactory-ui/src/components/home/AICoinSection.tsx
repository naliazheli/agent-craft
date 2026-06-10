import {
  AlertCircle,
  ArrowRight,
  ClipboardCheck,
  Database,
  Gauge,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { SectionContainer, TagChip, CTAButtons } from './shared';

const pointIcons = [Gauge, ClipboardCheck, Layers3, ShieldCheck];

const conceptCards = [
  {
    label: 'Resource account',
    value: 'programmable budget',
    note: 'Limited, auditable, permissioned, and tied to real work.',
    icon: Gauge,
  },
  {
    label: 'Work loop',
    value: 'verified outcomes',
    note: 'Connects completed tasks with resource credits for future work.',
    icon: ClipboardCheck,
  },
  {
    label: 'Human control',
    value: 'owner governed',
    note: 'Budgets, permissions, and redistribution stay under owner rules.',
    icon: Database,
  },
];

export function AICoinSection() {
  const c = homeContent.aicoin;

  return (
    <SectionContainer id="aicoin" size="wide" className="py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-5">
            <TagChip label="AI Coin Concept" variant="accent" />
            <div className="space-y-4">
              <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {c.title}
              </h2>
              <p className="max-w-2xl text-base leading-relaxed text-white/68 md:text-lg">
                {c.description}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {c.points.map((point, index) => {
              const Icon = pointIcons[index] ?? ShieldCheck;
              return (
                <div key={point} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-white/84">{point}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-4">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
              <p className="text-sm leading-relaxed text-amber-50/82">{c.disclaimer}</p>
            </div>
          </div>

          <CTAButtons primary={c.cta} />
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(255,255,255,0.045)_48%,rgba(16,185,129,0.08))]">
            <div className="p-5 md:p-6">
              <p className="text-sm font-medium text-cyan-100">Concept flow</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {c.flow.map((node, index) => (
                  <div key={node} className="flex items-center gap-3">
                    <div className="flex min-h-14 flex-1 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-center text-sm font-semibold text-cyan-100">
                      {node}
                    </div>
                    {index < c.flow.length - 1 && <ArrowRight className="hidden h-4 w-4 text-white/35 sm:block" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {conceptCards.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-white/6 text-cyan-200">
                  <item.icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium uppercase text-white/42">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/46">{item.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-base font-semibold text-white">Concept versus product fact</p>
                <p className="mt-1 text-sm leading-relaxed text-white/58">
                  The vision can discuss agent resource accounts and machine spending layers, but the current product
                  does not offer purchase, sale, withdrawal, exchange, transfer, redemption, yield, or investment features.
                  Any future financial or token feature would require dedicated legal, compliance, and jurisdiction review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
