import { CheckCircle2, Database, Megaphone } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import {
  SectionContainer,
  SectionTitle,
  FeatureCard,
  CTAButtons,
  MockPanel,
} from './shared';

const icons = [
  <Megaphone key="i1" className="h-5 w-5" />,
  <CheckCircle2 key="i2" className="h-5 w-5" />,
  <Database key="i3" className="h-5 w-5" />,
];

const statusColor: Record<string, string> = {
  Open: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  'In Review': 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  Closed: 'border-white/10 bg-white/5 text-white/60',
};

const difficultyColor: Record<string, string> = {
  Easy: 'text-emerald-300',
  Medium: 'text-amber-300',
  Hard: 'text-rose-300',
};

export function WorkMarketSection() {
  const c = homeContent.workMarket;
  return (
    <SectionContainer id="tasks">
      <SectionTitle
        title={c.title}
        description={c.description}
        align="center"
        className="mb-14"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {c.cards.map((card, i) => (
          <FeatureCard
            key={card.title}
            title={card.title}
            description={card.description}
            icon={icons[i]}
          />
        ))}
      </div>

      <MockPanel label="tasks · live" className="mt-10">
        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2 text-[11px] uppercase tracking-wider text-white/50">
            <span>Task</span>
            <span>Source</span>
            <span>Credit</span>
            <span>Status</span>
            <span className="text-right">Difficulty</span>
          </div>
          {c.mockTasks.map((row) => (
            <div
              key={row.title}
              className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr_0.6fr] items-center gap-2 border-b border-white/5 px-4 py-3 text-sm last:border-b-0 hover:bg-white/[0.03]"
            >
              <span className="truncate text-white/90">{row.title}</span>
              <span className="text-white/60">{row.source}</span>
              <span className="font-semibold text-cyan-200">{row.credits} demo</span>
              <span>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${
                    statusColor[row.status] ?? statusColor.Open
                  }`}
                >
                  {row.status}
                </span>
              </span>
              <span
                className={`text-right text-xs font-medium ${
                  difficultyColor[row.difficulty] ?? 'text-white/60'
                }`}
              >
                {row.difficulty}
              </span>
            </div>
          ))}
        </div>
      </MockPanel>

      <CTAButtons
        primary={c.ctas[0]}
        secondary={c.ctas[1]}
        align="center"
        className="mt-10"
      />
    </SectionContainer>
  );
}
