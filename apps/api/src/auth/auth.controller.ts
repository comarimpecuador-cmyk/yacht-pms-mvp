import { Body, Controller, Post, Res, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { Response, Request, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma.service';

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
  ) {}

  private getCookieContext() {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
    const domainOption = isProduction && cookieDomain ? { domain: cookieDomain } : {};
    const sameSite: CookieOptions['sameSite'] = isProduction ? 'none' : 'lax';
    const baseCookieOptions: CookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      path: '/',
      ...domainOption,
    };

    return { domainOption, baseCookieOptions };
  }

  private clearAuthCookies(response: Response) {
    const { domainOption } = this.getCookieContext();
    response.clearCookie('accessToken', { path: '/', ...domainOption });
    response.clearCookie('refreshToken', { path: '/', ...domainOption });
  }

  private setAuthCookies(response: Response, tokens: AuthTokens) {
    const { baseCookieOptions } = this.getCookieContext();

    response.cookie('accessToken', tokens.accessToken, {
      ...baseCookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', tokens.refreshToken, {
      ...baseCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private buildMobileAuthResponse(tokens: AuthTokens) {
    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    };
  }

  @Get('debug/cookies')
  debugCookies(@Req() req: Request) {
    console.log('🔍 DEBUG COOKIES RECIBIDAS:');
    console.log('Cookies:', req.cookies);
    console.log('Has accessToken:', !!req.cookies?.accessToken);
    console.log('Has refreshToken:', !!req.cookies?.refreshToken);
    return {
      cookies: req.cookies,
      hasAccessToken: !!req.cookies?.accessToken,
      hasRefreshToken: !!req.cookies?.refreshToken,
      message: req.cookies?.accessToken ? '✅ Cookies recibidas' : '❌ No hay cookies',
    };
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.loginWithEmail(body.email, body.password);
    this.clearAuthCookies(response);
    this.setAuthCookies(response, tokens);

    return { success: true };
  }

  @Post('mobile/login')
  async mobileLogin(@Body() body: LoginDto) {
    const tokens = await this.authService.loginWithEmail(body.email, body.password);
    return this.buildMobileAuthResponse(tokens);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() request: Request) {
    const user = request.user as any;
    
    // Fetch complete user data from database
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.userId },  // ✅ FIX: user.userId (era user.sub)
      include: {
        role: true,
      },
    });

    if (!fullUser) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    if (!fullUser.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Recalculate yachtIds for SystemAdmin if needed
    let yachtIds = user.yachtIds || [];
    if (user.role === 'SystemAdmin' && yachtIds.length === 0) {
      const allYachts = await this.prisma.yacht.findMany({ select: { id: true } });
      yachtIds = allYachts.map((y: any) => y.id);
    }

    return {
      id: user.userId,  // ✅ FIX: user.userId (era user.sub)
      email: fullUser.email,
      role: user.role,
      yachtIds: yachtIds,
    };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    this.clearAuthCookies(response);
    return { success: true };
  }

  @Post('mobile/logout')
  async mobileLogout() {
    return { success: true };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token');
      }

      const tokens = await this.authService.refresh(refreshToken);

      this.setAuthCookies(res, tokens);

      return res.json({ success: true });
    } catch (error) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('mobile/refresh')
  async mobileRefresh(@Body() body: RefreshDto) {
    try {
      const tokens = await this.authService.refresh(body.refreshToken);
      return this.buildMobileAuthResponse(tokens);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
