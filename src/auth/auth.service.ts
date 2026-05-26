import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bycrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import { Repository } from 'typeorm';
import { SignUpDto } from './dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class AuthService {
  user: User | null;
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.user = null;
    this.resend = new Resend(process.env.RESEND_API_KEY);
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
        status: true,
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

  getUserStatus = async (userId: string) => {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return { status: user.status };
  };

  hashData = (data: string) => bycrypt.hashSync(data, 10);

  signUp = async (signUpDto: SignUpDto) => {
    const { password, ...data } = signUpDto;

    const user = this.userRepository.create({
      ...data,
      password: this.hashData(password),
      status: 'PENDING',
    });

    await this.userRepository.save(user);

    delete user.password;

    await this.sendAccessRequestEmail(user).catch(e =>
      this.logger.error('Error sending access request email', e),
    );

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

  signInByGoogle = async (id_token: string) => {
    const { payload } = await this.googleAuthCheckIdToken(id_token);

    const existing = await this.userRepository.findOne({
      where: { email: payload.email },
    });

    if (existing) return existing;

    const user = this.userRepository.create({
      firstName: payload.given_name ?? payload.email!.split('@')[0],
      lastName: payload.family_name ?? '',
      email: payload.email,
      status: 'PENDING',
    });

    const saved = await this.userRepository.save(user);
    await this.sendAccessRequestEmail(saved).catch(e =>
      this.logger.error('Error sending access request email', e),
    );
    return saved;
  };

  approveUser = async (token: string) => {
    const { userId, email } = this.verifyActionToken(token);
    await this.userRepository.update(userId, { status: 'ACTIVE' });
    await this.sendUserApprovedEmail(email).catch(e =>
      this.logger.error('Error sending approved email', e),
    );
  };

  rejectUser = async (token: string) => {
    const { userId, email } = this.verifyActionToken(token);
    await this.userRepository.delete(userId);
    await this.sendUserRejectedEmail(email).catch(e =>
      this.logger.error('Error sending rejected email', e),
    );
  };

  generateActionToken = (userId: string, email: string, action: 'approve' | 'reject') =>
    this.jwtService.sign({ userId, email, action }, { expiresIn: '7d' });

  private verifyActionToken = (token: string): { userId: string; email: string; action: string } => {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new ForbiddenException('Token inválido o expirado');
    }
  };

  private sendEmail = async (opts: { to: string; subject: string; html: string }) => {
    const { data, error } = await this.resend.emails.send({
      from: process.env.RESEND_FROM ?? 'GastoFácil <onboarding@resend.dev>',
      ...opts,
    });
    if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
    return data;
  };

  private sendAccessRequestEmail = async (user: User) => {
    const backendUrl  = this.configService.get<string>('BACK_API_URL') ?? 'http://localhost:3000';
    const adminEmail  = this.configService.get<string>('ADMIN_EMAIL') ?? 'nachitogaute@gmail.com';
    const approveToken = this.generateActionToken(user.id, user.email, 'approve');
    const rejectToken  = this.generateActionToken(user.id, user.email, 'reject');
    const approveUrl   = `${backendUrl}/auth/approve?token=${approveToken}`;
    const rejectUrl    = `${backendUrl}/auth/reject?token=${rejectToken}`;
    const name = `${user.firstName} ${user.lastName}`.trim();

    await this.sendEmail({
      to: adminEmail,
      subject: `Solicitud de acceso — ${name}`,
      html: this.buildAdminRequestEmail({ name, email: user.email, approveUrl, rejectUrl }),
    });
  };

  private sendUserApprovedEmail = async (email: string) => {
    const frontendUrl = this.configService.get<string>('ALLOWED_ORIGINS') ?? 'http://localhost:3001';
    const adminEmail  = this.configService.get<string>('ADMIN_EMAIL') ?? 'nachitogaute@gmail.com';
    await this.sendEmail({
      to: adminEmail,
      subject: `✓ Acceso aprobado para ${email}`,
      html: this.buildUserApprovedEmail(frontendUrl, email),
    });
  };

  private sendUserRejectedEmail = async (email: string) => {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL') ?? 'nachitogaute@gmail.com';
    await this.sendEmail({
      to: adminEmail,
      subject: `✗ Solicitud rechazada para ${email}`,
      html: this.buildUserRejectedEmail(email),
    });
  };

  googleAuthCheckIdToken = async (id_token: string) => {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new ForbiddenException('Invalid Google token');
    return { payload };
  };

  private buildAdminRequestEmail = (p: { name: string; email: string; approveUrl: string; rejectUrl: string }) => `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0B0D13;font-family:Arial,sans-serif;color:#E6E8EE;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D13;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#11141D;border:1px solid #202534;border-radius:16px;">
        <tr><td style="padding:28px 24px 16px;">
          <div style="font-size:11px;color:#A8A2FF;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Solicitud de acceso</div>
          <h1 style="margin:0 0 8px;font-size:22px;color:#fff;">Nuevo usuario quiere ingresar</h1>
          <p style="margin:0;font-size:14px;color:#9AA3B2;">Alguien solicitó acceso a GastoFácil.</p>
        </td></tr>
        <tr><td style="padding:0 24px 16px;">
          <table width="100%" style="background:#0D1018;border:1px solid #202534;border-radius:12px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;font-size:11px;color:#8D94AA;text-transform:uppercase;letter-spacing:1px;">Nombre</p>
              <p style="margin:0 0 12px;font-size:16px;color:#fff;font-weight:bold;">${p.name}</p>
              <p style="margin:0 0 4px;font-size:11px;color:#8D94AA;text-transform:uppercase;letter-spacing:1px;">Email</p>
              <p style="margin:0;font-size:16px;color:#A8A2FF;">${p.email}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:8px;">
              <a href="${p.approveUrl}" style="display:block;text-align:center;padding:13px;background:#22C55E;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">✓ Aprobar</a>
            </td>
            <td style="padding-left:8px;">
              <a href="${p.rejectUrl}" style="display:block;text-align:center;padding:13px;background:#EF4444;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">✗ Rechazar</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  private buildUserApprovedEmail = (loginUrl: string, userEmail: string) => `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0B0D13;font-family:Arial,sans-serif;color:#E6E8EE;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D13;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#11141D;border:1px solid #202534;border-radius:16px;">
        <tr><td style="padding:28px 24px 24px;">
          <div style="font-size:11px;color:#22C55E;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Acceso aprobado</div>
          <h1 style="margin:0 0 8px;font-size:22px;color:#fff;">Usuario aprobado</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#9AA3B2;">Aprobaste el acceso de <strong style="color:#A8A2FF;">${userEmail}</strong>. Ya puede ingresar a GastoFácil.</p>
          <a href="${loginUrl}/login" style="display:inline-block;padding:13px 28px;background:#6C63FF;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">Ver app</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  private buildUserRejectedEmail = (userEmail: string) => `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0B0D13;font-family:Arial,sans-serif;color:#E6E8EE;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D13;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#11141D;border:1px solid #202534;border-radius:16px;">
        <tr><td style="padding:28px 24px 24px;">
          <div style="font-size:11px;color:#EF4444;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Solicitud rechazada</div>
          <h1 style="margin:0 0 8px;font-size:22px;color:#fff;">Solicitud rechazada</h1>
          <p style="margin:0;font-size:14px;color:#9AA3B2;">Rechazaste la solicitud de <strong style="color:#A8A2FF;">${userEmail}</strong>. El usuario fue eliminado.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
