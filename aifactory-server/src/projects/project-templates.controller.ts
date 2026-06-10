import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectTemplatesService } from './project-templates.service';

@ApiTags('project-templates')
@Controller('project-templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectTemplatesController {
  constructor(private readonly service: ProjectTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List available project templates' })
  async list(@Request() req: any) {
    const templates = await this.service.listTemplates(req.user.id);
    return { templates };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project template by id' })
  async get(@Param('id') id: string, @Request() req: any) {
    return this.service.getTemplate(id, req.user.id);
  }
}
