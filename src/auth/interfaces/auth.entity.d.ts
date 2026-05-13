import { ResponseJWTAuth } from './jwt-payload.interface';

export interface IAuthEntity {
  user: UserEntity | null;
  attempt: (email: string, password: string) => Promise<boolean>;
  checkEmail: (email: string) => Promise<UserEntity>;
  createJwtToken: (payload: JwtPayload) => ResponseJWTAuth;
  bycryptPassword: (
    password: string | Buffer,
    saltOrRounds?: string | number,
  ) => string;
}
