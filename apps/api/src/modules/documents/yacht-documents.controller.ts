import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { YachtScope } from '../../common/decorators/yacht-scope.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { YachtScopeGuard } from '../../common/guards/yacht-scope.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, ListDocumentsQueryDto } from './dto';

@Controller('yachts/:yachtId/documents')
@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
export class YachtDocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  listDocuments(
    @Param('yachtId') yachtId: string,
    @Query() query: ListDocumentsQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listDocuments({ ...query, yachtId }, req.user.yachtIds || []);
  }

  @Post()
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  @YachtScope()
  createDocument(
    @Param('yachtId') yachtId: string,
    @Body() body: CreateDocumentDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.createDocument(req.user.userId, { ...body, yachtId }, req.user.yachtIds || []);
  }
}
