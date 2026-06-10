import { Body, Controller, Headers, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsLocalCodexController {
  constructor(private readonly projectsService: ProjectsService) {}

  private bearerToken(authorization?: string) {
    const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim());
    if (!match) {
      throw new UnauthorizedException('Missing local Codex token');
    }
    return match[1];
  }

  @Post('account-local-runners/local-codex/runner/claim')
  @ApiOperation({ summary: 'Claim the next local-codex launch job for an account runner token' })
  async claimAccountLocalCodexAgentRuntime(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const runner = await this.projectsService.authenticateAccountLocalRunnerToken(this.bearerToken(authorization));
    return this.projectsService.claimLocalCodexAgentRuntimeForAccount(runner.userId);
  }

  @Post('account-local-runners/local-codex/runner/heartbeat')
  @ApiOperation({ summary: 'Refresh account-level local-codex runner presence with a runner token' })
  async heartbeatAccountLocalCodexRunner(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateAccountLocalRunnerToken(this.bearerToken(authorization));
    return this.projectsService.heartbeatAccountLocalRunner(runner.userId, 'local-codex', dto, runner.tokenId, runner.name);
  }

  @Post('account-local-runners/local-codex/runner/disconnect')
  @ApiOperation({ summary: 'Disconnect account-level local-codex runner presence with a runner token' })
  async disconnectAccountLocalCodexRunner(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateAccountLocalRunnerToken(this.bearerToken(authorization));
    return this.projectsService.disconnectAccountLocalRunner(runner.userId, 'local-codex', dto, runner.tokenId, runner.name);
  }

  @Post(':id/agent-runtimes/local-codex/runner/claim')
  @ApiOperation({ summary: 'Claim a pending local-codex launch job with a runner token' })
  async claimLocalCodexAgentRuntime(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('memberId') memberId?: string,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.claimLocalCodexAgentRuntime(projectId, runner.userId, memberId);
  }

  @Post(':id/agent-runtimes/local-codex/runner/heartbeat')
  @ApiOperation({ summary: 'Refresh project-level local-codex runner presence with a runner token' })
  async heartbeatLocalCodexRunner(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.heartbeatProjectLocalRunner(projectId, runner.userId, 'local-codex', dto, runner.tokenId, runner.name);
  }

  @Post(':id/agent-runtimes/local-codex/runner/disconnect')
  @ApiOperation({ summary: 'Disconnect project-level local-codex runner presence with a runner token' })
  async disconnectLocalCodexRunner(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.disconnectProjectLocalRunner(projectId, runner.userId, 'local-codex', dto, runner.tokenId, runner.name);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/runner/complete')
  @ApiOperation({ summary: 'Complete a local-codex launch job with a runner token' })
  async completeLocalCodexAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.completeLocalCodexAgentRuntime(projectId, memberId, runner.userId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/runner/disconnect')
  @ApiOperation({ summary: 'Disconnect a local-codex runtime with a runner token' })
  async disconnectLocalCodexAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.disconnectLocalCodexAgentRuntime(projectId, memberId, runner.userId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/runner/requests/next')
  @ApiOperation({ summary: 'Fetch the next local-codex message request with a runner token' })
  async nextLocalCodexAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.nextLocalCodexAgentRuntimeRequest(projectId, memberId, runner.userId);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/runner/requests/:requestId/complete')
  @ApiOperation({ summary: 'Complete a local-codex message request with a runner token' })
  async completeLocalCodexAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.completeLocalCodexAgentRuntimeRequest(projectId, memberId, runner.userId, requestId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-codex/runner/requests/:requestId/progress')
  @ApiOperation({ summary: 'Report local-codex message progress with a runner token' })
  async progressLocalCodexAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.progressLocalCodexAgentRuntimeRequest(projectId, memberId, runner.userId, requestId, dto);
  }
}
