import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import { GoogleSignInDto, SignInDto, SignUpDto } from './dto';
import { User } from 'src/users/entities/user.entity';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post("sign-in")
  async signin(@Body() signInDto: SignInDto, @Req() req: Request) {
    const { email, password } = signInDto;

    // 👇 ahora devuelve el user directamente
    const user = await this.authService.attempt(email, password);

    const tokens = await this.authService.createJwtToken({ id: user.id });

    return { user, ...tokens };
  }

  @Post('google/sign-in')
  async googleSignIn(@Body() googleSignDto: GoogleSignInDto) {
    const { id_token } = googleSignDto;
    const user = await this.authService.signInByGoogle(id_token);
    const tokens = await this.authService.createJwtToken({ id: user.id });
    return { user, ...tokens };
  }

  @Post('sign-up')
  async signup(@Body() signUpDto: SignUpDto, @Req() req: Request) {
    this.logger.verbose(
      `User signup: ${JSON.stringify({
        data: signUpDto,
        reqIp: req.ip,
        agent: req.headers['user-agent'],
        host: req.headers.host,
      })}`,
    );
    const user = await this.authService.signUp(signUpDto);

    const tokens = await this.authService.createJwtToken({ id: user.id });

    return {
      user,
      ...tokens,
    };
  }

  @Get('profile')
  @Auth()
  async profile(@GetUser() user: User) {
    return user;
  }

  @Post('refresh')
  async refreshToken(@Body('refresh_token') refresh_token: string) {
    return await this.authService.refreshToken(refresh_token);
  }

  @Get('status')
  async getStatus(@Headers('authorization') auth: string) {
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = this.jwtService.verify(auth.slice(7));
      return await this.authService.getUserStatus(payload.id);
    } catch {
      throw new UnauthorizedException();
    }
  }

  @Get('approve')
  async approveUser(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.approveUser(token);
      return res.send(this.buildActionResultHtml(true, 'approve'));
    } catch {
      return res.status(400).send(this.buildActionResultHtml(false, 'approve'));
    }
  }

  @Get('reject')
  async rejectUser(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.rejectUser(token);
      return res.send(this.buildActionResultHtml(true, 'reject'));
    } catch {
      return res.status(400).send(this.buildActionResultHtml(false, 'reject'));
    }
  }

  private buildActionResultHtml(success: boolean, action: 'approve' | 'reject') {
    const color   = success ? (action === 'approve' ? '#22C55E' : '#EF4444') : '#EF4444';
    const title   = success
      ? action === 'approve' ? 'Usuario aprobado' : 'Usuario rechazado'
      : 'Token inválido o expirado';
    const message = success
      ? action === 'approve'
        ? 'El usuario ha sido aprobado y ya puede ingresar a GastoFácil.'
        : 'La solicitud fue rechazada y el usuario fue eliminado.'
      : 'El enlace que usaste no es válido o ya expiró.';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0B0D13;font-family:Arial,sans-serif;color:#E6E8EE;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="max-width:440px;width:100%;background:#11141D;border:1px solid #202534;border-radius:16px;padding:36px 28px;text-align:center;">
    <div style="font-size:40px;margin-bottom:16px;">${success ? (action === 'approve' ? '✓' : '✗') : '⚠'}</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:${color};">${title}</h1>
    <p style="margin:0;font-size:14px;color:#9AA3B2;">${message}</p>
  </div>
</body></html>`;
  }

    // @Get('logout')
    // @Auth()
    // async logout(@Req() req: Request) {
    //   console.log(req.user);
    // }
}
