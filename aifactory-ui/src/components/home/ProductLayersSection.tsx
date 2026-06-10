import { ListChecks, Layers, ArrowRight } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import {
  SectionContainer,
  SectionTitle,
  GlassCard,
  TagChip,
  CTAButtons,
} from './shared';

export function ProductLayersSection() {
  const c = homeContent.productLayers;
  return (
    <SectionContainer>
      <SectionTitle title={c.title} align="center" className="mb-14" />

      <div className="grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
        <LayerCard
          icon={<ListChecks className="h-5 w-5" />}
          data={c.taskCard}
          accent="cyan"
        />

        <div className="hidden items-center justify-center md:flex">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70">
            <ArrowRight className="h-5 w-5" />
          </div>
        </div>

        <LayerCard
          icon={<Layers className="h-5 w-5" />}
          data={c.projectCard}
          accent="violet"
        />
      </div>

      <p className="mx-auto mt-12 max-w-3xl text-center text-base font-medium text-white/80 md:text-lg">
        {c.connector}
      </p>
    </SectionContainer>
  );
}

function LayerCard({
  icon,
  data,
  accent,
}: {
  icon: React.ReactNode;
  data: {
    tag: string;
    title: string;
    subtitle: string;
    items: readonly string[];
    closing: string;
    cta: { label: string; href: string };
  };
  accent: 'cyan' | 'violet';
}) {
  const tones =
    accent === 'cyan'
      ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200'
      : 'border-violet-400/20 bg-violet-400/10 text-violet-200';
  return (
    <GlassCard className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${tones}`}
        >
          {icon}
        </div>
        <TagChip label={data.tag} variant="outline" />
      </div>
      <div>
        <h3 className="text-2xl font-semibold text-white">{data.title}</h3>
        <p className="mt-1 text-sm text-white/60">{data.subtitle}</p>
      </div>
      <ul className="flex flex-col gap-2.5 text-sm text-white/75 md:text-base">
        {data.items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-4 pt-2">
        <p className="text-sm font-medium text-white/85">{data.closing}</p>
        <CTAButtons secondary={data.cta} />
      </div>
    </GlassCard>
  );
}
