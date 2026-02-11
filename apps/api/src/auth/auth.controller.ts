import { Body, Controller, Post, Res, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
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

    // Reset explícito para evitar mezcla de sesión al cambiar de usuario
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/' });
    
    // 🔐 MIGRACIÓN: HTTP-Only Cookies
    response.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    response.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/',
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
    // Limpiar cookies
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    try {
      // 1. Leer refreshToken de cookie httpOnly
      const refreshToken = req.cookies?.refreshToken;
      
      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token');
      }

      // 2. Validar y generar nuevos tokens
      const tokens = await this.authService.refresh(refreshToken);

      // 3. Actualizar cookies (mismo formato que login)
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return res.json({ success: true });
    } catch (error) {
      // Limpiar cookies si hay error
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
