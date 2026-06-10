import { ArrowDown, ArrowRight } from 'lucide-react';
import { homeContent } from '@/lib/home-content';
import { SectionContainer, SectionTitle } from './shared';
import { cn } from '@/lib/utils';

function FlowBox({
  title,
  description,
  tone = 'default',
  compact = false,
}: {
  title: string;
  description?: string;
  tone?: 'default' | 'green' | 'gray' | 'orange';
  compact?: boolean;
}) {
  const styles =
    tone === 'green'
      ? 'bg-[#d9ebe0] text-[#1f2d26]'
      : tone === 'gray'
      ? 'bg-[#e9e7e2] text-[#202020]'
      : tone === 'orange'
      ? 'border border-[#e7a06c] bg-[#fff7f1] text-[#31221a]'
      : 'bg-[#f0efeb] text-[#202020]';

  return (
    <div
      className={cn(
        'flex min-h-[74px] w-full flex-col items-center justify-center rounded-md px-4 py-3 text-center shadow-sm',
        compact ? 'lg:min-h-[56px]' : 'lg:min-h-[64px]',
        styles,
      )}
    >
      <div className="text-sm font-semibold leading-5">{title}</div>
      {description && (
        <div className="mt-1 max-w-[150px] text-[11px] font-medium leading-4 opacity-65">
          {description}
        </div>
      )}
    </div>
  );
}

function Arrow({ mobile = false }: { mobile?: boolean }) {
  return mobile ? (
    <div className="flex justify-center text-[#707070] lg:hidden">
      <ArrowDown className="h-5 w-5" strokeWidth={2.4} />
    </div>
  ) : (
    <div className="hidden items-center justify-center text-[#707070] lg:flex">
      <ArrowRight className="h-7 w-7" strokeWidth={2.4} />
    </div>
  );
}

export function WorkflowSection() {
  const c = homeContent.workflow;
  const [
    ownerGoal,
    templateStates,
    coordinator,
    agents,
    lead,
    done,
    ownerTodo,
  ] = c.steps;

  return (
    <SectionContainer id="how-it-works" size="wide">
      <SectionTitle
        eyebrow={c.eyebrow}
        title={c.title}
        description={c.description}
        align="center"
        className="mb-10"
      />

      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#f8f7f2] p-5 text-[#202020] shadow-2xl shadow-cyan-950/20 md:p-8">
        <div className="relative">
          <div className="hidden lg:block">
            <div className="absolute left-[18%] right-[23%] top-0 h-[164px] rounded-2xl border border-dashed border-[#d9d9d4]">
              <div className="absolute left-1/2 top-3 -translate-x-1/2 bg-[#f8f7f2] px-3 text-xs font-medium text-[#9a9994]">
                project loop
              </div>
            </div>

            <div className="relative grid grid-cols-[110px_40px_126px_40px_126px_40px_140px_40px_132px_40px_58px] items-center pt-10">
              <FlowBox title={ownerGoal.title} description="Owner input" />
              <Arrow />
              <FlowBox title={templateStates.title} tone="green" />
              <Arrow />
              <FlowBox title={coordinator.title} tone="green" />
              <Arrow />
              <FlowBox title={agents.title} tone="green" />
              <Arrow />
              <FlowBox title={lead.title} tone="green" />
              <Arrow />
              <FlowBox title={done.title} tone="gray" compact />
            </div>

            <div className="relative mt-6 grid grid-cols-[200px_1fr] items-start gap-4">
              <FlowBox
                title={ownerTodo.title}
                description={ownerTodo.description}
                tone="orange"
                compact
              />
              <div className="relative h-16">
                <div className="absolute left-0 top-7 h-px w-[48%] border-t border-dashed border-[#e3a06e]" />
                <div className="absolute left-[48%] top-[-4px] h-[33px] border-l border-dashed border-[#e3a06e]" />
                <ArrowDown
                  className="absolute left-[48%] top-[-11px] h-5 w-5 -translate-x-1/2 rotate-180 text-[#e3a06e]"
                  strokeWidth={2.4}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            <FlowBox title={ownerGoal.title} description="Owner input" />
            <Arrow mobile />
            <div className="rounded-2xl border border-dashed border-[#d9d9d4] p-3">
              <div className="mb-3 text-center text-xs font-medium text-[#9a9994]">
                project loop
              </div>
              <div className="grid gap-3">
                <FlowBox title={templateStates.title} description={templateStates.description} tone="green" />
                <Arrow mobile />
                <FlowBox title={coordinator.title} description={coordinator.description} tone="green" />
                <Arrow mobile />
                <FlowBox title={agents.title} description={agents.description} tone="green" />
                <Arrow mobile />
                <FlowBox title={lead.title} description={lead.description} tone="green" />
              </div>
            </div>
            <Arrow mobile />
            <FlowBox title={done.title} tone="gray" compact />
            <div className="my-1 flex justify-center text-[#e3a06e]">
              <ArrowDown className="h-5 w-5 rotate-180" strokeWidth={2.4} />
            </div>
            <FlowBox title={ownerTodo.title} description={ownerTodo.description} tone="orange" compact />
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
