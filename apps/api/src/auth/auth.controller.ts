import { Body, Controller, Post, Res, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { Response, Request, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
  ) {}

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

    response.clearCookie('accessToken', { path: '/', ...domainOption });
    response.clearCookie('refreshToken', { path: '/', ...domainOption });

    response.cookie('accessToken', tokens.accessToken, {
      ...baseCookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', tokens.refreshToken, {
      ...baseCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { success: true };
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
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
    const domainOption = isProduction && cookieDomain ? { domain: cookieDomain } : {};

    response.clearCookie('accessToken', { path: '/', ...domainOption });
    response.clearCookie('refreshToken', { path: '/', ...domainOption });
    return { success: true };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
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

    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token');
      }

      const tokens = await this.authService.refresh(refreshToken);

      res.cookie('accessToken', tokens.accessToken, {
        ...baseCookieOptions,
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('refreshToken', tokens.refreshToken, {
        ...baseCookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({ success: true });
    } catch (error) {
      res.clearCookie('accessToken', { path: '/', ...domainOption });
      res.clearCookie('refreshToken', { path: '/', ...domainOption });
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
