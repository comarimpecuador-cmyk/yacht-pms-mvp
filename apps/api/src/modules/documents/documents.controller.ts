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
import { DocumentsService } from './documents.service';
import {
  AddDocumentEvidenceDto,
  ApproveDocumentDto,
  CreateDocumentDto,
  CreateDocumentVersionDto,
  ListDocumentsQueryDto,
  RejectDocumentDto,
  SubmitDocumentDto,
  UpdateDocumentDto,
  UpdateDocumentRenewalDto,
} from './dto';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }

  @Get()
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  listDocuments(
    @Query() query: ListDocumentsQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listDocuments(query, req.user.yachtIds || []);
  }

  @Post()
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  @YachtScope()
  createDocument(
    @Body() body: CreateDocumentDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.createDocument(req.user.userId, body, req.user.yachtIds || []);
  }

  @Get('summary/:yachtId')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  getSummary(@Param('yachtId') yachtId: string, @Req() req: { user: { yachtIds: string[] } }) {
    return this.service.getSummary(yachtId, req.user.yachtIds || []);
  }

  @Get('expiring/:yachtId')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  getExpiring(
    @Param('yachtId') yachtId: string,
    @Query('days') days = '30',
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.getExpiring(yachtId, Number(days), req.user.yachtIds || []);
  }

  @Get(':id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  getDocument(@Param('id') id: string, @Req() req: { user: { yachtIds: string[] } }) {
    return this.service.getDocument(id, req.user.yachtIds || []);
  }

  @Patch(':id')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  updateDocument(
    @Param('id') id: string,
    @Body() body: UpdateDocumentDto,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.service.updateDocument(id, req.user.userId, req.user.role, body, req.user.yachtIds || []);
  }

  @Post(':id/archive')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  archiveDocument(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.service.archiveDocument(id, req.user.userId, req.user.role, req.user.yachtIds || []);
  }

  @Post(':id/evidences')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  addEvidence(
    @Param('id') id: string,
    @Body() body: AddDocumentEvidenceDto,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.service.addEvidence(id, body, req.user.userId, req.user.role, req.user.yachtIds || []);
  }

  @Post(':id/renewals')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  startRenewal(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.service.startRenewal(id, req.user.userId, req.user.role, req.user.yachtIds || []);
  }

  @Patch(':id/renewals/:renewalId')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  updateRenewal(
    @Param('id') id: string,
    @Param('renewalId') renewalId: string,
    @Body() body: UpdateDocumentRenewalDto,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.service.updateRenewal(id, renewalId, req.user.userId, req.user.role, body, req.user.yachtIds || []);
  }

  @Post(':id/versions')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  addVersion(
    @Param('id') id: string,
    @Body() body: CreateDocumentVersionDto,
    @Req() req: { user: { userId: string; role: string; yachtIds: string[] } },
  ) {
    return this.service.addVersion(id, body, req.user.userId, req.user.role, req.user.yachtIds || []);
  }

  @Post(':id/submit')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  submitDocument(
    @Param('id') id: string,
    @Body() body: SubmitDocumentDto,
    @Req() req: { user: { userId: string; yachtIds: string[]; role: string } },
  ) {
    return this.service.submitDocument(id, req.user.userId, req.user.role, body, req.user.yachtIds || []);
  }

  @Post(':id/approve')
  @Roles('Captain', 'Admin', 'SystemAdmin')
  approveDocument(
    @Param('id') id: string,
    @Body() body: ApproveDocumentDto,
    @Req() req: { user: { userId: string; yachtIds: string[]; role: string } },
  ) {
    return this.service.approveDocument(id, req.user.userId, req.user.role, body, req.user.yachtIds || []);
  }

  @Post(':id/reject')
  @Roles('Captain', 'Admin', 'SystemAdmin')
  rejectDocument(
    @Param('id') id: string,
    @Body() body: RejectDocumentDto,
    @Req() req: { user: { userId: string; yachtIds: string[]; role: string } },
  ) {
    return this.service.rejectDocument(id, req.user.userId, req.user.role, body, req.user.yachtIds || []);
  }

  @Delete(':id')
  @Roles('Admin', 'SystemAdmin')
  deleteDocument(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; yachtIds: string[]; role: string } },
  ) {
    return this.service.deleteDocument(id, req.user.userId, req.user.role, req.user.yachtIds || []);
  }
}
