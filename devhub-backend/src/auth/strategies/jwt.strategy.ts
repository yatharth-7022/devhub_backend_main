import { requireJwtSecret } from 'src/common/jwt-secret';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private logger = new Logger('JwtStrategy');

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(configService),
    });
    this.logger.log(
      `JWT Secret loaded: ${configService.get<string>('JWT_SECRET') ? 'YES' : 'NO'}`,
    );
  }

  async validate(payload: any) {
    this.logger.log(`Validating JWT payload: ${JSON.stringify(payload)}`);
    const user = { sub: payload.sub, email: payload.email };
    this.logger.log(`Returning user: ${JSON.stringify(user)}`);
    return user;
  }
}
