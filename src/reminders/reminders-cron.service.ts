import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

@Injectable()
export class RemindersCronService {
  private readonly logger = new Logger(RemindersCronService.name);

  constructor(private readonly remindersService: RemindersService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRemindersCron() {
    const startedAt = Date.now();

    this.logger.log('CRON START | Checking pending reminders...');

    try {
      await this.remindersService.processPendingReminders();

      const durationMs = Date.now() - startedAt;

      this.logger.log(`CRON END | Reminders processed successfully | ${durationMs}ms`);
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      const message =
        error instanceof Error ? error.message : 'Unknown cron error';

      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `CRON ERROR | Failed processing reminders | ${durationMs}ms | message=${message}`,
        stack,
      );
    }
  }
}