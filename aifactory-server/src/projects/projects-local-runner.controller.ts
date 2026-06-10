import { Body, Controller, Headers, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsLocalRunnerController {
  constructor(private readonly projectsService: ProjectsService) {}

  private bearerToken(authorization?: string) {
    const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim());
    if (!match) {
      throw new UnauthorizedException('Missing local runner token');
    }
    return match[1];
  }

  @Post('account-local-runners/local-runner/runner/claim')
  @ApiOperation({ summary: 'Claim the next local-runner launch job for an account runner token' })
  async claimAccountLocalRunnerAgentRuntime(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const runner = await this.projectsService.authenticateAccountLocalRunnerToken(this.bearerToken(authorization));
    return this.projectsService.claimLocalRunnerAgentRuntimeForAccount(runner.userId);
  }

  @Post('account-local-runners/local-runner/runner/heartbeat')
  @ApiOperation({ summary: 'Refresh account-level local-runner presence with a runner token' })
  async heartbeatAccountLocalRunner(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateAccountLocalRunnerToken(this.bearerToken(authorization));
    return this.projectsService.heartbeatAccountLocalRunner(runner.userId, 'local-runner', dto, runner.tokenId, runner.name);
  }

  @Post('account-local-runners/local-runner/runner/disconnect')
  @ApiOperation({ summary: 'Disconnect account-level local-runner presence with a runner token' })
  async disconnectAccountLocalRunner(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateAccountLocalRunnerToken(this.bearerToken(authorization));
    return this.projectsService.disconnectAccountLocalRunner(runner.userId, 'local-runner', dto, runner.tokenId, runner.name);
  }

  @Post(':id/agent-runtimes/local-runner/runner/claim')
  @ApiOperation({ summary: 'Claim a pending local-runner launch job with a runner token' })
  async claimLocalRunnerAgentRuntime(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('memberId') memberId?: string,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.claimLocalRunnerAgentRuntime(projectId, runner.userId, memberId);
  }

  @Post(':id/agent-runtimes/local-runner/runner/heartbeat')
  @ApiOperation({ summary: 'Refresh project-level local-runner presence with a runner token' })
  async heartbeatLocalRunner(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.heartbeatProjectLocalRunner(projectId, runner.userId, 'local-runner', dto, runner.tokenId, runner.name);
  }

  @Post(':id/agent-runtimes/local-runner/runner/disconnect')
  @ApiOperation({ summary: 'Disconnect project-level local-runner presence with a runner token' })
  async disconnectLocalRunner(
    @Param('id') projectId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.disconnectProjectLocalRunner(projectId, runner.userId, 'local-runner', dto, runner.tokenId, runner.name);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/runner/complete')
  @ApiOperation({ summary: 'Complete a local-runner launch job with a runner token' })
  async completeLocalRunnerAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.completeLocalRunnerAgentRuntime(projectId, memberId, runner.userId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/runner/disconnect')
  @ApiOperation({ summary: 'Disconnect a local-runner runtime with a runner token' })
  async disconnectLocalRunnerAgentRuntime(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.disconnectLocalRunnerAgentRuntime(projectId, memberId, runner.userId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/runner/requests/next')
  @ApiOperation({ summary: 'Fetch the next local-runner message request with a runner token' })
  async nextLocalRunnerAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.nextLocalRunnerAgentRuntimeRequest(projectId, memberId, runner.userId);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/runner/requests/:requestId/complete')
  @ApiOperation({ summary: 'Complete a local-runner message request with a runner token' })
  async completeLocalRunnerAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.completeLocalRunnerAgentRuntimeRequest(projectId, memberId, runner.userId, requestId, dto);
  }

  @Post(':id/agent-runtimes/:memberId/local-runner/runner/requests/:requestId/progress')
  @ApiOperation({ summary: 'Report local-runner message progress with a runner token' })
  async progressLocalRunnerAgentRuntimeRequest(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: any,
  ) {
    const runner = await this.projectsService.authenticateLocalRunnerToken(projectId, this.bearerToken(authorization));
    return this.projectsService.progressLocalRunnerAgentRuntimeRequest(projectId, memberId, runner.userId, requestId, dto);
  }
}
