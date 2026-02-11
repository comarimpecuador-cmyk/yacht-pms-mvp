import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateUserDto,
  FindUserByEmailDto,
  SetUserAccessesDto,
  UpdateUserStatusDto,
} from './dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  listUsers(@Query('q') query?: string) {
    return this.usersService.listUsers(query);
  }

  @Post()
  @Roles('SystemAdmin')
  createUser(
    @Req() req: { user: { userId: string } },
    @Body() body: CreateUserDto,
  ) {
    return this.usersService.createUser(req.user.userId, body);
  }

  @Patch(':id/status')
  @Roles('SystemAdmin')
  updateStatus(
    @Req() req: { user: { userId: string } },
    @Param('id') userId: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.usersService.updateUserStatus(req.user.userId, userId, body.isActive);
  }

  @Get(':id/accesses')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  getAccesses(@Param('id') userId: string, @Query('includeRevoked') includeRevoked?: string) {
    return this.usersService.getUserAccesses(userId, includeRevoked === 'true');
  }

  @Put(':id/accesses')
  @Roles('SystemAdmin')
  setAccesses(
    @Req() req: { user: { userId: string } },
    @Param('id') userId: string,
    @Body() body: SetUserAccessesDto,
  ) {
    return this.usersService.setUserAccesses(req.user.userId, userId, body);
  }

  @Post('by-email')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  getByEmail(@Body() body: FindUserByEmailDto) {
    return this.usersService.findByEmail(body.email);
  }

  @Get('by-email/:email')
  @Roles('Admin', 'Management/Office', 'SystemAdmin')
  getByEmailParam(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }
}
