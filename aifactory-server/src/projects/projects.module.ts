import { Module } from '@nestjs/common';
import { ApiConfigModule } from '../api-config/api-config.module';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentWorkspaceClient } from './agent-workspace.client';
import { AgentWorkspaceProxyController } from './agent-workspace-proxy.controller';
import { AgentRuntimeLauncherService } from './agent-runtime-launcher.service';
import { ProjectFilesProxyController } from './project-files-proxy.controller';
import { ProjectsLocalRunnerController } from './projects-local-runner.controller';
import { ProjectsLocalCodexController } from './projects-local-codex.controller';
import { ProjectsPublicController } from './projects-public.controller';
import { ProjectsRuntimeController } from './projects-runtime.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectTemplatesController } from './project-templates.controller';
import { ProjectTemplatesService } from './project-templates.service';

@Module({
  imports: [PrismaModule, ApiConfigModule, LlmModule],
  controllers: [
    ProjectsController,
    ProjectsPublicController,
    ProjectFilesProxyController,
    ProjectsLocalRunnerController,
    ProjectsLocalCodexController,
    ProjectsRuntimeController,
    AgentWorkspaceProxyController,
    ProjectTemplatesController,
  ],
  providers: [ProjectsService, AgentWorkspaceClient, AgentRuntimeLauncherService, ProjectTemplatesService],
  exports: [ProjectsService, ProjectTemplatesService],
})
export class ProjectsModule {}
