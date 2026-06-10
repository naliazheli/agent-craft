import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiConfigService } from './api-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateApiConfigDto, UpdateApiConfigDto } from './dto/api-config.dto';

interface RequestWithUser {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('api-configs')
@UseGuards(JwtAuthGuard)
export class ApiConfigController {
  constructor(private readonly apiConfigService: ApiConfigService) {}

  @Post()
  create(@Request() req: RequestWithUser, @Body() createApiConfigDto: CreateApiConfigDto) {
    return this.apiConfigService.create(req.user.id, createApiConfigDto);
  }

  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.apiConfigService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.apiConfigService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateApiConfigDto: UpdateApiConfigDto,
  ) {
    return this.apiConfigService.update(req.user.id, id, updateApiConfigDto);
  }

  @Delete(':id')
  remove(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.apiConfigService.remove(req.user.id, id);
  }

  @Put(':id/activate')
  activate(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.apiConfigService.activate(req.user.id, id);
  }

  @Get('active/current')
  getActive(@Request() req: RequestWithUser) {
    return this.apiConfigService.getActive(req.user.id);
  }
}
