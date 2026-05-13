import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

@Injectable()
export class RemindersCronService {
  private readonly logger = new Logger(RemindersCronService.name);

  constructor(private readonly remindersService: RemindersService) {}

  @Cron('* * * * *', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async handleRemindersCron() {
    const startedAt = Date.now();

    const nowArgentina = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());

    this.logger.log(
      `CRON START | Checking pending reminders... | Argentina time=${nowArgentina}`,
    );

    try {
      await this.remindersService.processPendingReminders();

      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `CRON END | Reminders processed successfully | ${durationMs}ms | Argentina time=${nowArgentina}`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      const message =
        error instanceof Error ? error.message : 'Unknown cron error';

      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `CRON ERROR | Failed processing reminders | ${durationMs}ms | message=${message} | Argentina time=${nowArgentina}`,
        stack,
      );
    }
  }
}