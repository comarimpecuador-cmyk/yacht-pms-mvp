import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateYachtDto, GrantYachtAccessDto } from './dto';
import { YachtsService } from './yachts.service';

@Controller('yachts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YachtsController {
  constructor(private readonly yachtsService: YachtsService) {}

  @Post()
  @Roles('Admin', 'Management/Office')
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

  @Post(':id/access')
  @Roles('Admin', 'Management/Office')
  grantAccess(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') yachtId: string,
    @Body() body: GrantYachtAccessDto,
  ) {
    return this.yachtsService.grantAccess(req.user.userId, req.user.role, yachtId, body);
  }

  @Get(':id/access')
  @Roles('Admin', 'Management/Office')
  listAccess(@Req() req: { user: { role: string } }, @Param('id') yachtId: string) {
    return this.yachtsService.listYachtAccess(req.user.role, yachtId);
  }
}
