import {
  Body,
  Controller,
  Delete,
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
  CreateEngineDto,
  CreateLogBookEntryDto,
  UpdateEngineDto,
  UpdateLogBookEntryDto,
} from './dto';
import { LogbookService } from './logbook.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
export class LogbookController {
  constructor(private readonly logbookService: LogbookService) {}

  @Post('logbook/entries')
  @Roles('Chief Engineer', 'Crew Member')
  @YachtScope()
  createEntry(@Req() req: { user: { userId: string } }, @Body() body: CreateLogBookEntryDto) {
    return this.logbookService.createEntry(req.user.userId, body);
  }

  @Get('logbook/entries')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  listEntries(
    @Query('yachtId') yachtId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.logbookService.listEntries(yachtId, from, to);
  }

  @Get('logbook/entries/:id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  getEntry(@Param('id') id: string, @Req() req: { user: { yachtIds: string[] } }) {
    return this.logbookService.getEntry(id, req.user.yachtIds || []);
  }

  @Patch('logbook/entries/:id')
  @Roles('Chief Engineer', 'Crew Member', 'Admin')
  updateEntry(
    @Param('id') id: string,
    @Body() body: UpdateLogBookEntryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.logbookService.updateEntry(id, body, req.user.yachtIds || []);
  }

  @Post('logbook/entries/:id/submit')
  @Roles('Chief Engineer', 'Crew Member', 'Admin')
  submitEntry(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.logbookService.submitEntry(id, req.user.userId, req.user.yachtIds || []);
  }

  @Post('logbook/entries/:id/lock')
  @Roles('Captain', 'Chief Engineer', 'Admin')
  lockEntry(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.logbookService.lockEntry(id, req.user.userId, req.user.role, req.user.yachtIds || []);
  }

  @Post('engines')
  @Roles('Chief Engineer', 'Captain', 'Admin')
  @YachtScope()
  createEngine(@Body() body: CreateEngineDto) {
    return this.logbookService.createEngine(body);
  }

  @Get('engines')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  listEngines(
    @Query('yachtId') yachtId: string,
    @Req() req: { user: { yachtIds: string[]; role: string } },
  ) {
    return this.logbookService.listEngines(yachtId, req.user.yachtIds || [], req.user.role);
  }

  @Patch('engines/:id')
  @Roles('Chief Engineer', 'Captain', 'Admin')
  updateEngine(
    @Param('id') id: string,
    @Body() body: UpdateEngineDto,
    @Req() req: { user: { yachtIds: string[]; role: string } },
  ) {
    return this.logbookService.updateEngine(id, body, req.user.yachtIds || [], req.user.role);
  }

  @Delete('engines/:id')
  @Roles('Chief Engineer', 'Captain', 'Admin')
  deleteEngine(
    @Param('id') id: string,
    @Req() req: { user: { yachtIds: string[]; role: string } },
  ) {
    return this.logbookService.deleteEngine(id, req.user.yachtIds || [], req.user.role);
  }
}
