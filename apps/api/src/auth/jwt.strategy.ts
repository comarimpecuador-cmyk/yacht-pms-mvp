import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

type JwtPayload = { sub: string; role: string; yachtIds?: string[] };

// 🔐 EXTRACTOR HTTP-ONLY COOKIES
const cookieExtractor = (req: Request): string | null => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['accessToken'] || null;
  }
  if (process.env.DEBUG_AUTH === 'true') {
    console.log('[JwtStrategy] Cookies recibidas:', req?.cookies);
    console.log('[JwtStrategy] Token extraido:', token ? 'presente (length: ' + token.length + ')' : 'null');
  }
  return token;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') || 'change_me_access',
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      role: payload.role,
      yachtIds: payload.yachtIds ?? [],
    };
  }
}
