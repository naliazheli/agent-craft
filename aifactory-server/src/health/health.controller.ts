import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('/health')
  @Redirect('/api/health', 301)
  healthLegacy() {
    // Redirects to /api/health for backward compatibility
  }
}
