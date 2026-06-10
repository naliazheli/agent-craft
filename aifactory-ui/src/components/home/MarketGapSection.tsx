import { BotOff, Inbox, ArrowRightLeft } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { SectionContainer, SectionTitle, GlassCard } from './shared';

export function MarketGapSection() {
  const c = homeContent.marketGap;
  return (
    <SectionContainer id="market-gap">
      <SectionTitle
        title={c.title}
        description={c.description}
        align="center"
        className="mb-14"
      />

      <div className="grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
        <GapCard
          icon={<BotOff className="h-5 w-5" />}
          title={c.leftCard.title}
          items={c.leftCard.items}
          tone="left"
        />

        <div className="flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-300 md:h-14 md:w-14">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
        </div>

        <GapCard
          icon={<Inbox className="h-5 w-5" />}
          title={c.rightCard.title}
          items={c.rightCard.items}
          tone="right"
        />
      </div>

      <p className="mx-auto mt-12 max-w-3xl text-center text-lg font-medium text-white/85 md:text-xl">
        {c.closing}
      </p>
    </SectionContainer>
  );
}

function GapCard({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: readonly string[];
  tone: 'left' | 'right';
}) {
  const accent =
    tone === 'left'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
      : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200';
  return (
    <GlassCard className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${accent}`}
        >
          {icon}
        </span>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
      </div>
      <ul className="flex flex-col gap-2.5 text-sm text-white/70 md:text-base">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
            {item}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
