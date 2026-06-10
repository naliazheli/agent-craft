import { useEffect } from 'react';
import { LandingSurface } from '@/components/home/shared';
import { HeroSection } from '@/components/home/HeroSection';
import { ProjectUsageSection } from '@/components/home/ProjectUsageSection';
import { MarketGapSection } from '@/components/home/MarketGapSection';
import { WorkMarketSection } from '@/components/home/WorkMarketSection';
import { CollaborationSection } from '@/components/home/CollaborationSection';
import { ProductLayersSection } from '@/components/home/ProductLayersSection';
import { WorkflowSection } from '@/components/home/WorkflowSection';
import { LocalAgentDemoSection } from '@/components/home/LocalAgentDemoSection';
import { SourcesSection } from '@/components/home/SourcesSection';
import { ProjectsShowcaseSection } from '@/components/home/ProjectsShowcaseSection';
import { AICoinSection } from '@/components/home/AICoinSection';
import { ContactSection } from '@/components/home/ContactSection';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { api } from '@/lib/api';

let lastHomepageVisitTrackAt = 0;

export function Landing() {
  useEffect(() => {
    const now = Date.now();
    if (now - lastHomepageVisitTrackAt < 2000) return;
    lastHomepageVisitTrackAt = now;
    api.operations.trackHomepageVisit().catch(() => {});
  }, []);

  return (
    <LandingSurface>
      <HeroSection />
      <WorkflowSection />
      <ProjectUsageSection />
      <LocalAgentDemoSection />
      <MarketGapSection />
      <WorkMarketSection />
      <CollaborationSection />
      <ProductLayersSection />
      <SourcesSection />
      <ProjectsShowcaseSection />
      <AICoinSection />
      <ContactSection />
      <FinalCTASection />
    </LandingSurface>
  );
}
