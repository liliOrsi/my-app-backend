import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.logger.error('RESEND_API_KEY is not configured');
    }

    this.resend = new Resend(apiKey);
  }

  async sendReminderEmail(params: {
    to: string;
    description: string;
    remindAt: Date;
  }) {
    const { to, description, remindAt } = params;

    this.logger.log(
      `Preparing reminder email | to=${to} | remindAt=${remindAt.toISOString()}`,
    );

    try {
      const from =
        process.env.RESEND_FROM ?? 'Recordatorios <onboarding@resend.dev>';

      this.logger.debug(`Sending reminder email with Resend | from=${from}`);

      const safeDescription = this.escapeHtml(description);
      const formattedDate = this.formatDate(remindAt);

      const result = await this.resend.emails.send({
        from,
        to,
        subject: `Recordatorio: ${description.slice(0, 45)}`,
        text: `Tenés un recordatorio pendiente.\n\n${description}\n\nFecha: ${formattedDate}`,
        html: this.buildReminderTemplate({
          description: safeDescription,
          formattedDate,
        }),
      });

      this.logger.debug(`Resend response: ${JSON.stringify(result)}`);

      if (result.error) {
        this.logger.error(
          `Resend failed sending reminder email | to=${to} | error=${result.error.message}`,
        );

        throw new InternalServerErrorException(result.error.message);
      }

      this.logger.log(
        `Reminder email sent successfully | to=${to} | resendId=${result.data?.id}`,
      );

      return result.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown mail service error';

      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error sending reminder email | to=${to} | message=${message}`,
        stack,
      );

      throw error;
    }
  }

  private buildReminderTemplate(params: {
    description: string;
    formattedDate: string;
  }) {
    const { description, formattedDate } = params;

    return `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Recordatorio pendiente</title>
        </head>

        <body style="margin:0; padding:0; background:#0B0D13; font-family:Arial, Helvetica, sans-serif; color:#E6E8EE;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0B0D13; padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px; background:#11141D; border:1px solid rgba(255,255,255,0.08); border-radius:24px; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.35);">
                  
                  <tr>
                    <td style="height:4px; background:linear-gradient(90deg,#6C63FF,#38BDF8,#34D399);"></td>
                  </tr>

                  <tr>
                    <td style="padding:32px 32px 20px;">
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                          <td>
                            <div style="display:inline-block; padding:8px 12px; border-radius:999px; background:rgba(108,99,255,0.12); border:1px solid rgba(108,99,255,0.24); color:#A8A2FF; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
                              Recordatorio
                            </div>
                          </td>
                        </tr>
                      </table>

                      <h1 style="margin:22px 0 8px; font-size:30px; line-height:1.15; color:#FFFFFF; font-weight:800;">
                        Tenés un recordatorio pendiente
                      </h1>

                      <p style="margin:0; color:#8D94AA; font-size:15px; line-height:1.6;">
                        GastoFácil te avisa sobre una tarea programada.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:8px 32px 0;">
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0D1018; border:1px solid rgba(255,255,255,0.07); border-radius:18px;">
                        <tr>
                          <td style="padding:22px;">
                            <p style="margin:0 0 10px; color:#6B7188; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase;">
                              Descripción
                            </p>

                            <p style="margin:0; color:#F5F7FB; font-size:18px; line-height:1.55; font-weight:700;">
                              ${description}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:16px 32px 0;">
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(108,99,255,0.08); border:1px solid rgba(108,99,255,0.18); border-radius:18px;">
                        <tr>
                          <td style="padding:18px 20px;">
                            <p style="margin:0 0 8px; color:#A8A2FF; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase;">
                              Fecha y hora
                            </p>

                            <p style="margin:0; color:#FFFFFF; font-size:17px; line-height:1.5; font-weight:800;">
                              ${formattedDate}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px 32px 8px;">
                      <div style="height:1px; background:rgba(255,255,255,0.08);"></div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:8px 32px 32px;">
                      <p style="margin:0; color:#6B7188; font-size:12px; line-height:1.6;">
                        Este email fue enviado automáticamente por GastoFácil. Si ya realizaste esta tarea, podés ignorar este mensaje.
                      </p>
                    </td>
                  </tr>

                </table>

                <p style="margin:18px 0 0; color:#424761; font-size:12px;">
                  GastoFácil · Control de gastos
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private formatDate(date: Date) {
    return date.toLocaleString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}