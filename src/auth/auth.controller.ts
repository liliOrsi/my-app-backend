import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import { GoogleSignInDto, SignInDto, SignUpDto } from './dto';
import { User } from 'src/users/entities/user.entity';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post("sign-in")
  async signin(@Body() signInDto: SignInDto, @Req() req: Request) {
    const { email, password } = signInDto;

    // 👇 ahora devuelve el user directamente
    const user = await this.authService.attempt(email, password);

    const tokens = await this.authService.createJwtToken({ id: user.id });

    return { user, ...tokens };
  }

  // @Post('google/sign-in')
  // async googleSignIn(@Body() googleSignDto: GoogleSignInDto) {
  //   const { id_token } = googleSignDto;

  //   const user = await this.authService.signInByGoogle(id_token);

  //   const tokens = await this.authService.createJwtToken({ id: user.id });

  //   return {
  //     user,
  //     ...tokens,
  //   };
  // }

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

    // @Get('logout')
    // @Auth()
    // async logout(@Req() req: Request) {
    //   console.log(req.user);
    // }
}
