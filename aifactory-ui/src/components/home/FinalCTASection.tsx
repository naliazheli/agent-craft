import { homeContent } from '@/lib/home-content';
import { SectionContainer, CTAButtons } from './shared';

export function FinalCTASection() {
  const c = homeContent.finalCta;
  return (
    <SectionContainer size="narrow" className="text-center">
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-6 py-16 md:px-12 md:py-20">
        {/* glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(600px 240px at 50% 0%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(500px 220px at 50% 100%, rgba(139,92,246,0.16), transparent 60%)',
          }}
        />
        <div className="relative flex flex-col items-center gap-5">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl lg:text-5xl">
            {c.title}
          </h2>
          <p className="max-w-2xl text-base text-white/70 md:text-lg">
            {c.description}
          </p>
          <CTAButtons
            primary={c.ctas[0]}
            secondary={c.ctas[1]}
            tertiary={c.ctas[2]}
            align="center"
            className="mt-4"
          />
        </div>
      </div>
    </SectionContainer>
  );
}
