import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bycrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { SignUpDto } from './dto';
import {
  JwtPayload
} from './interfaces/jwt-payload.interface';

import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';
// import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  user: User | null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.user = null;
  }

  attempt = async (email: string, password: string): Promise<User> => {
    const user = await this.checkEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = bycrypt.compareSync(password, user.password);

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    delete user.password;
    return user;
  };;

  checkEmail = async (email: string) => {
    return await this.userRepository.findOne({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        password: true,
      },
    });
  };

  createJwtToken = async (payload: JwtPayload) => {
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '30m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      type: 'Bearer',
    };
  };

  hashData = (data: string) => bycrypt.hashSync(data, 10);

  signUp = async (signUpDto: SignUpDto) => {
    const { password, ...data } = signUpDto;

    const user = this.userRepository.create({
      ...data,
      password: this.hashData(password),
    });

    await this.userRepository.save(user);

    delete user.password;

    return user;
  };

  refreshToken = async (refresh_token: string) => {
    try {
      const payload = this.jwtService.verify(refresh_token);

      const newAccessToken = this.jwtService.sign(
        { id: payload.id },
        { expiresIn: '30m' }
      );

      return {
        access_token: newAccessToken,
      };
    } catch (error) {
      throw new ForbiddenException('Invalid refresh token');
    }
  };

  // signInByGoogle = async (id_token: string) => {
  //   const verifyGoogleIdToken = await this.googleAuthCheckIdToken(id_token);
  //   // Check email and sign tokens
  //   const findUserByEmail = await this.userRepository.findOne({
  //     where: { email: verifyGoogleIdToken.payload.email },
  //   });

  //   // If exist return it
  //   if (findUserByEmail) return findUserByEmail;
  //   //if not create and return
  //   else {
  //     const userPayload = verifyGoogleIdToken.payload;
  //     const instanceUser = this.userRepository.create({
  //       name: userPayload.given_name,
  //       email: userPayload.email,
  //       surname: userPayload.family_name,
  //     });

  //     const createUser = await this.userRepository.save(instanceUser);

  //     return createUser;
  //   }
  // };

  // googleAuthCheckIdToken = async (id_token: string) => {
  //   const client = new OAuth2Client();

  //   const verifyGoogleIdToken: any = await client
  //     .verifyIdToken({
  //       idToken: id_token,
  //       audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
  //     })
  //     .then((decodeToken) => {
  //       return decodeToken;
  //     })
  //     .catch((err) => {
  //       return {
  //         error: err,
  //       };
  //     });

  //   if (verifyGoogleIdToken.error) {
  //     throw new BadRequestException('Invalid id token');
  //   }

  //   return verifyGoogleIdToken;
  // };
}
