export interface JwtPayload {
  id: string;
}

export interface ResponseJWTAuth {
  access_token: string;
  expires_at: string;
  type: string;
}
