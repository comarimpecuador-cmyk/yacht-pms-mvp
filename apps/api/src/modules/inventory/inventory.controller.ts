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
  CreateInventoryItemDto,
  CreateInventoryMovementDto,
  ListInventoryItemsQueryDto,
  ListInventoryMovementsQueryDto,
  UpdateInventoryItemDto,
} from './dto';
import { InventoryService } from './inventory.service';

type RequestUser = {
  user: {
    userId: string;
    role: string;
    yachtIds: string[];
  };
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('inventory/status')
  getStatus() {
    return this.service.status();
  }

  @Get('yachts/:yachtId/inventory/items')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  listItems(
    @Param('yachtId') yachtId: string,
    @Query() query: ListInventoryItemsQueryDto,
    @Req() req: RequestUser,
  ) {
    return this.service.listItems(yachtId, query, req.user);
  }

  @Post('yachts/:yachtId/inventory/items')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  @YachtScope()
  createItem(
    @Param('yachtId') yachtId: string,
    @Body() body: CreateInventoryItemDto,
    @Req() req: RequestUser,
  ) {
    return this.service.createItem(yachtId, body, req.user);
  }

  @Get('inventory/items/:id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  getItem(@Param('id') id: string, @Req() req: RequestUser) {
    return this.service.getItem(id, req.user);
  }

  @Patch('inventory/items/:id')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin')
  updateItem(
    @Param('id') id: string,
    @Body() body: UpdateInventoryItemDto,
    @Req() req: RequestUser,
  ) {
    return this.service.updateItem(id, body, req.user);
  }

  @Post('inventory/items/:id/movements')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  createMovement(
    @Param('id') id: string,
    @Body() body: CreateInventoryMovementDto,
    @Req() req: RequestUser,
  ) {
    return this.service.createMovement(id, body, req.user);
  }

  @Get('yachts/:yachtId/inventory/movements')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  listMovements(
    @Param('yachtId') yachtId: string,
    @Query() query: ListInventoryMovementsQueryDto,
    @Req() req: RequestUser,
  ) {
    return this.service.listMovements(yachtId, query, req.user);
  }
}
