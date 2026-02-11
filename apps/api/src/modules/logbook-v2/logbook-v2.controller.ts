import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { YachtScope } from '../../common/decorators/yacht-scope.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { YachtScopeGuard } from '../../common/guards/yacht-scope.guard';
import {
  ListLogbookV2EventsQueryDto,
  UpdateLogbookV2EventDto,
  UpdateLogbookV2StatusDto,
} from './dto';
import { LogbookV2Service } from './logbook-v2.service';

type RequestUser = {
  user: {
    userId: string;
    role: string;
    yachtIds: string[];
  };
};

@Controller('logbook/v2')
@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
export class LogbookV2Controller {
  constructor(private readonly logbookV2Service: LogbookV2Service) {}

  @Post('events')
  @Roles('Captain', 'Chief Engineer', 'Admin', 'SystemAdmin')
  createEvent(@Body() body: unknown, @Req() req: RequestUser) {
    return this.logbookV2Service.createEventForActor(req.user, body);
  }

  @Get('events')
  @Roles('Captain', 'Chief Engineer', 'Admin', 'SystemAdmin')
  @YachtScope()
  listEvents(@Query() query: ListLogbookV2EventsQueryDto, @Req() req: RequestUser) {
    return this.logbookV2Service.listEventsForActor(req.user, query);
  }

  @Get('events/:id')
  @Roles('Captain', 'Chief Engineer', 'Admin', 'SystemAdmin')
  getEvent(@Param('id') id: string, @Req() req: RequestUser) {
    return this.logbookV2Service.getEventForActor(req.user, id);
  }

  @Patch('events/:id')
  @Roles('Captain', 'Chief Engineer', 'Admin', 'SystemAdmin')
  updateEvent(
    @Param('id') id: string,
    @Body() body: UpdateLogbookV2EventDto,
    @Req() req: RequestUser,
  ) {
    return this.logbookV2Service.updateEventForActor(req.user, id, body);
  }

  @Patch('events/:id/status')
  @Roles('Captain', 'Admin', 'SystemAdmin')
  updateEventStatus(
    @Param('id') id: string,
    @Body() body: UpdateLogbookV2StatusDto,
    @Req() req: RequestUser,
  ) {
    return this.logbookV2Service.updateEventStatusForActor(req.user, id, body);
  }
}
