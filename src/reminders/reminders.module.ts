import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from './entities/reminders.entity';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { RemindersCronService } from './reminders-cron.service';
import { MailService } from './mail.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reminder])],
  controllers: [RemindersController],
  providers: [
    RemindersService,
    RemindersCronService,
    MailService,
  ],
})
export class RemindersModule {}