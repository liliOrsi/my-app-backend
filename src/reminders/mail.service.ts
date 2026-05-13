import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Resend } from 'resend';

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

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
      const from = this.getFromAddress();

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

  private getFromAddress() {
    const from =
      process.env.RESEND_FROM?.trim() || 'Recordatorios <onboarding@resend.dev>';

    const isValidFrom =
      /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(from) ||
      /^.+\s<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(from);

    if (!isValidFrom) {
      this.logger.error(
        `Invalid RESEND_FROM format | value="${from}" | expected="email@example.com" or "Name <email@example.com>"`,
      );

      throw new InternalServerErrorException(
        'Invalid RESEND_FROM format. Use email@example.com or Name <email@example.com>',
      );
    }

    return from;
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

      <body style="margin:0; padding:0; background-color:#0B0D13; font-family:Arial, Helvetica, sans-serif; color:#E6E8EE;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#0B0D13; margin:0; padding:20px 12px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:520px; background-color:#11141D; border:1px solid #202534; border-radius:16px;">
                
                <tr>
                  <td style="padding:24px 20px 12px 20px;">
                    <div style="display:inline-block; padding:6px 10px; border-radius:999px; background-color:#1A1F33; border:1px solid #313B66; color:#A8A2FF; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">
                      Recordatorio
                    </div>

                    <h1 style="margin:18px 0 8px 0; font-size:28px; line-height:1.2; color:#FFFFFF;">
                      Tenés un recordatorio pendiente
                    </h1>

                    <p style="margin:0; font-size:15px; line-height:1.5; color:#9AA3B2;">
                      GastoFácil te avisa sobre una tarea programada.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#0D1018; border:1px solid #202534; border-radius:12px;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="margin:0 0 8px 0; font-size:11px; color:#8D94AA; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">
                            Descripción
                          </p>
                          <p style="margin:0; font-size:18px; line-height:1.4; color:#FFFFFF; font-weight:bold;">
                            ${description}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 20px 12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#151936; border:1px solid #2D3767; border-radius:12px;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="margin:0 0 8px 0; font-size:11px; color:#A8A2FF; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">
                            Fecha y hora
                          </p>
                          <p style="margin:0; font-size:16px; line-height:1.4; color:#FFFFFF; font-weight:bold;">
                            ${formattedDate}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 20px 20px 20px;">
                    <div style="height:1px; background-color:#202534; margin-bottom:14px;"></div>
                    <p style="margin:0; font-size:12px; line-height:1.5; color:#7E8798;">
                      Este email fue enviado automáticamente por GastoFácil. Si ya realizaste esta tarea, podés ignorar este mensaje.
                    </p>
                  </td>
                </tr>

              </table>

              <p style="margin:14px 0 0 0; font-size:12px; color:#5E6678;">
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
      timeZone: ARGENTINA_TIME_ZONE,
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