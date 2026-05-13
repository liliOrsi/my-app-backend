import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export function AuthRefreshToken() {
  return applyDecorators(UseGuards(AuthGuard('jwt-refresh')));
}
