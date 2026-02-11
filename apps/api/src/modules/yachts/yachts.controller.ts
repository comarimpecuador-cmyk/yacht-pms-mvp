import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateYachtDto,
  GrantYachtAccessDto,
  UpdateYachtAccessDto,
  UpdateYachtDto,
} from './dto';
import { YachtsService } from './yachts.service';

@Controller('yachts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YachtsController {
  constructor(private readonly yachtsService: YachtsService) {}

  @Post()
  @Roles('SystemAdmin')
  createYacht(
    @Req() req: { user: { userId: string; role: string } },
    @Body() body: CreateYachtDto,
  ) {
    return this.yachtsService.createYacht(req.user.userId, req.user.role, body);
  }

  @Get()
  listYachts(@Req() req: { user: { userId: string; role: string } }) {
    return this.yachtsService.listVisibleYachts(req.user.userId, req.user.role);
  }

  @Get(':id')
  getYacht(@Req() req: { user: { userId: string; role: string } }, @Param('id') yachtId: string) {
    return this.yachtsService.getVisibleYacht(req.user.userId, req.user.role, yachtId);
  }

  @Get(':id/summary')
  getYachtSummary(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') yachtId: string,
  ) {
    return this.yachtsService.getYachtSummary(req.user.userId, req.user.role, yachtId);
  }

  @Patch(':id')
  @Roles('SystemAdmin')
  updateYacht(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') yachtId: string,
    @Body() body: UpdateYachtDto,
  ) {
    return this.yachtsService.updateYacht(req.user.userId, req.user.role, yachtId, body);
  }

  @Post(':id/access')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  grantAccess(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') yachtId: string,
    @Body() body: GrantYachtAccessDto,
  ) {
    return this.yachtsService.grantAccess(req.user.userId, req.user.role, yachtId, body);
  }

  @Get(':id/access')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  listAccess(@Req() req: { user: { role: string } }, @Param('id') yachtId: string) {
    return this.yachtsService.listYachtAccess(req.user.role, yachtId);
  }

  @Patch(':id/access/:uid')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  updateAccess(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') yachtId: string,
    @Param('uid') userId: string,
    @Body() body: UpdateYachtAccessDto,
  ) {
    return this.yachtsService.updateAccess(req.user.userId, req.user.role, yachtId, userId, body);
  }

  @Delete(':id/access/:uid')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  removeAccess(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') yachtId: string,
    @Param('uid') userId: string,
  ) {
    return this.yachtsService.removeAccess(req.user.userId, req.user.role, yachtId, userId);
  }
}
