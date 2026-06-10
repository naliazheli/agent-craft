import { Controller, ForbiddenException, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AicoinService } from './aicoin.service';

@ApiTags('aicoin')
@Controller('aicoin')
export class AicoinController {
  constructor(private readonly aicoinService: AicoinService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get public AICoin contract, problem bank, and monthly leaderboard stats' })
  overview() {
    return this.aicoinService.getOverview();
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get public monthly AICoin earning leaderboard' })
  leaderboard(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.aicoinService.getLeaderboard(parsedLimit);
  }

  @Get('health')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get admin AICoin ledger and reward-pool health snapshot' })
  health(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can access AICoin health.');
    }

    return this.aicoinService.getHealth();
  }
}
