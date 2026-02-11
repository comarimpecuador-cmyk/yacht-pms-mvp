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
  AddPurchaseOrderAttachmentDto,
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  PurchaseOrderActionReasonDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto';
import { PurchaseOrdersService } from './purchase-orders.service';

type RequestUser = {
  user: {
    userId: string;
    role: string;
    yachtIds: string[];
  };
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get('purchase-orders/status')
  getStatus() {
    return this.service.status();
  }

  @Get('yachts/:yachtId/purchase-orders')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  listPurchaseOrders(
    @Param('yachtId') yachtId: string,
    @Query() query: ListPurchaseOrdersQueryDto,
    @Req() req: RequestUser,
  ) {
    return this.service.listPurchaseOrders(yachtId, query, req.user);
  }

  @Post('yachts/:yachtId/purchase-orders')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'Crew Member', 'Management/Office', 'Admin', 'SystemAdmin')
  @YachtScope()
  createPurchaseOrder(
    @Param('yachtId') yachtId: string,
    @Body() body: CreatePurchaseOrderDto,
    @Req() req: RequestUser,
  ) {
    return this.service.createPurchaseOrder(yachtId, body, req.user);
  }

  @Get('purchase-orders/:id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  getPurchaseOrder(@Param('id') id: string, @Req() req: RequestUser) {
    return this.service.getPurchaseOrder(id, req.user);
  }

  @Patch('purchase-orders/:id')
  @Roles('Chief Engineer', 'Captain', 'Crew Member', 'Management/Office', 'Admin', 'SystemAdmin')
  updatePurchaseOrder(
    @Param('id') id: string,
    @Body() body: UpdatePurchaseOrderDto,
    @Req() req: RequestUser,
  ) {
    return this.service.updatePurchaseOrder(id, body, req.user);
  }

  @Post('purchase-orders/:id/submit')
  @Roles('Chief Engineer', 'Captain', 'Crew Member', 'Management/Office', 'Admin', 'SystemAdmin')
  submitPurchaseOrder(
    @Param('id') id: string,
    @Body() body: PurchaseOrderActionReasonDto,
    @Req() req: RequestUser,
  ) {
    return this.service.submitPurchaseOrder(id, body, req.user);
  }

  @Post('purchase-orders/:id/approve')
  @Roles('Captain', 'Admin', 'SystemAdmin')
  approvePurchaseOrder(
    @Param('id') id: string,
    @Body() body: PurchaseOrderActionReasonDto,
    @Req() req: RequestUser,
  ) {
    return this.service.approvePurchaseOrder(id, body, req.user);
  }

  @Post('purchase-orders/:id/mark-ordered')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  markOrdered(
    @Param('id') id: string,
    @Body() body: PurchaseOrderActionReasonDto,
    @Req() req: RequestUser,
  ) {
    return this.service.markOrdered(id, body, req.user);
  }

  @Post('purchase-orders/:id/receive')
  @Roles('Chief Engineer', 'Captain', 'Admin', 'SystemAdmin')
  receivePurchaseOrder(
    @Param('id') id: string,
    @Body() body: ReceivePurchaseOrderDto,
    @Req() req: RequestUser,
  ) {
    return this.service.receivePurchaseOrder(id, body, req.user);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  cancelPurchaseOrder(
    @Param('id') id: string,
    @Body() body: PurchaseOrderActionReasonDto,
    @Req() req: RequestUser,
  ) {
    return this.service.cancelPurchaseOrder(id, body, req.user);
  }

  @Post('purchase-orders/:id/add-document')
  @Roles('Chief Engineer', 'Captain', 'Crew Member', 'Management/Office', 'Admin', 'SystemAdmin')
  addAttachment(
    @Param('id') id: string,
    @Body() body: AddPurchaseOrderAttachmentDto,
    @Req() req: RequestUser,
  ) {
    return this.service.addAttachment(id, body, req.user);
  }
}
