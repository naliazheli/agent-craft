import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { normalizeOptionalEmail, normalizeSystemEmail } from '../common/system-email';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  private assertSystemUser(req: any) {
    const allowedEmail = normalizeSystemEmail(process.env.OPERATIONS_SYSTEM_EMAIL || process.env.SYSTEM_USER_EMAIL);
    const legacyEmail = normalizeOptionalEmail(process.env.LEGACY_SYSTEM_EMAIL);
    const normalizedEmail = req.user?.email?.toLowerCase() || '';
    const isPrivilegedUser =
      req.user?.role === 'ADMIN' ||
      normalizedEmail === allowedEmail.toLowerCase() ||
      (Boolean(legacyEmail) && normalizedEmail === legacyEmail);

    if (!isPrivilegedUser) {
      throw new ForbiddenException('Only administrators or the configured system account can access operations data.');
    }
  }

  @Post('homepage-visit')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Track an AgentCraft homepage visit' })
  async recordHomepageVisit() {
    await this.service.recordHomepageVisit();
    return { ok: true };
  }

  @Get('overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get operations overview metrics' })
  async getOverview(@Request() req: any) {
    this.assertSystemUser(req);
    return this.service.getOverview();
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List registered users for operations monitoring' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'q', required: false })
  async listUsers(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    this.assertSystemUser(req);
    return this.service.listUsers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
    });
  }
}
