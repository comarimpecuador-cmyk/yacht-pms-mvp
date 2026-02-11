import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private normalizeRole(role?: string | null): string {
    if (!role) return 'Captain';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  private async signTokens(payload: { sub: string; role: string; yachtIds: string[] }) {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        yachtAccesses: { where: { revokedAt: null }, select: { yachtId: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('User inactive');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async loginFromUser(user: {
    id: string;
    role?: { name: string } | null;
    yachtAccesses: { yachtId: string }[];
  }) {
    const roleName = this.normalizeRole(user.role?.name);

    let yachtIds: string[];
    if (roleName === 'SystemAdmin') {
      const allYachts = await this.prisma.yacht.findMany({ select: { id: true } });
      yachtIds = allYachts.map((y) => y.id);
    } else {
      yachtIds = user.yachtAccesses.map((x) => x.yachtId);
    }

    return this.signTokens({ sub: user.id, role: roleName, yachtIds });
  }

  async loginWithEmail(email: string, password: string) {
    const user = await this.validateUser(email, password);
    return this.loginFromUser(user);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; role: string; yachtIds?: string[] };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: true,
        yachtAccesses: { where: { revokedAt: null }, select: { yachtId: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid token');
    if (!user.isActive) throw new UnauthorizedException('User inactive');

    const roleName = this.normalizeRole(user.role?.name ?? payload.role);

    let yachtIds: string[];
    if (roleName === 'SystemAdmin') {
      const allYachts = await this.prisma.yacht.findMany({ select: { id: true } });
      yachtIds = allYachts.map((y) => y.id);
    } else {
      yachtIds = user.yachtAccesses.map((x) => x.yachtId);
    }

    return this.signTokens({ sub: user.id, role: roleName, yachtIds });
  }
}
