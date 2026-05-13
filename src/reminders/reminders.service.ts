import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { CreateReminderDto } from './dto/create-reminders.dto';
import { Reminder, ReminderStatus } from './entities/reminders.entity';
import { MailService } from './mail.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepository: Repository<Reminder>,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateReminderDto) {
    this.logger.log(
      `CREATE REMINDER START | email=${dto.email} | remindAt=${dto.remindAt} | notifyBeforeMinutes=${dto.notifyBeforeMinutes}`,
    );

    try {
      const remindAt = new Date(dto.remindAt);

      if (Number.isNaN(remindAt.getTime())) {
        this.logger.warn(
          `CREATE REMINDER FAILED | Invalid date | remindAt=${dto.remindAt}`,
        );

        throw new BadRequestException('La fecha del recordatorio no es válida');
      }

      const now = new Date();

      if (remindAt <= now) {
        this.logger.warn(
          `CREATE REMINDER FAILED | Date is not future | remindAt=${remindAt.toISOString()} | now=${now.toISOString()}`,
        );

        throw new BadRequestException(
          'La fecha del recordatorio debe ser futura',
        );
      }

      const notifyBeforeMinutes = dto.notifyBeforeMinutes ?? 0;

      const notifyAt = new Date(
        remindAt.getTime() - notifyBeforeMinutes * 60 * 1000,
      );

      if (notifyAt <= now) {
        this.logger.warn(
          `CREATE REMINDER FAILED | notifyAt already passed | notifyAt=${notifyAt.toISOString()} | now=${now.toISOString()}`,
        );

        throw new BadRequestException(
          'El horario de aviso calculado ya pasó. Elegí menos minutos de anticipación.',
        );
      }

      const reminder = this.reminderRepository.create({
        email: dto.email,
        description: dto.description,
        remindAt,
        notifyBeforeMinutes,
        notifyAt,
        status: ReminderStatus.PENDING,
      });

      const saved = await this.reminderRepository.save(reminder);

      this.logger.log(
        `CREATE REMINDER SUCCESS | id=${saved.id} | email=${saved.email} | remindAt=${saved.remindAt.toISOString()} | notifyAt=${saved.notifyAt.toISOString()}`,
      );

      return saved;
    } catch (error) {
      this.logError('CREATE REMINDER ERROR', error);

      throw error;
    }
  }

  async findAll() {
    this.logger.log('FIND ALL REMINDERS START');

    try {
      const reminders = await this.reminderRepository.find({
        order: {
          createdAt: 'DESC',
        },
      });

      this.logger.log(`FIND ALL REMINDERS SUCCESS | count=${reminders.length}`);

      return reminders;
    } catch (error) {
      this.logError('FIND ALL REMINDERS ERROR', error);

      throw error;
    }
  }

  async processPendingReminders() {
    const now = new Date();

    this.logger.log(
      `PROCESS PENDING REMINDERS START | now=${now.toISOString()}`,
    );

    try {
      const reminders = await this.reminderRepository.find({
        where: {
          status: ReminderStatus.PENDING,
          notifyAt: LessThanOrEqual(now),
        },
        take: 50,
        order: {
          notifyAt: 'ASC',
        },
      });

      this.logger.log(
        `PROCESS PENDING REMINDERS FOUND | count=${reminders.length}`,
      );

      if (!reminders.length) {
        this.logger.log('PROCESS PENDING REMINDERS END | no reminders found');
        return;
      }

      for (const reminder of reminders) {
        await this.processOneReminder(reminder);
      }

      this.logger.log(
        `PROCESS PENDING REMINDERS END | processed=${reminders.length}`,
      );
    } catch (error) {
      this.logError('PROCESS PENDING REMINDERS ERROR', error);

      throw error;
    }
  }

  private async processOneReminder(reminder: Reminder) {
    this.logger.log(
      `PROCESS ONE REMINDER START | id=${reminder.id} | email=${reminder.email} | notifyAt=${reminder.notifyAt.toISOString()} | retryCount=${reminder.retryCount}`,
    );

    try {
      await this.reminderRepository.update(reminder.id, {
        status: ReminderStatus.PROCESSING,
      });

      this.logger.log(
        `PROCESS ONE REMINDER STATUS UPDATED | id=${reminder.id} | status=${ReminderStatus.PROCESSING}`,
      );

      await this.mailService.sendReminderEmail({
        to: reminder.email,
        description: reminder.description,
        remindAt: reminder.remindAt,
      });

      await this.reminderRepository.update(reminder.id, {
        status: ReminderStatus.SENT,
        sentAt: new Date(),
        lastError: null,
      });

      this.logger.log(
        `PROCESS ONE REMINDER SUCCESS | id=${reminder.id} | email=${reminder.email} | status=${ReminderStatus.SENT}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;

      const nextRetryCount = (reminder.retryCount ?? 0) + 1;

      const nextStatus =
        nextRetryCount >= 3 ? ReminderStatus.FAILED : ReminderStatus.PENDING;

      this.logger.error(
        `PROCESS ONE REMINDER ERROR | id=${reminder.id} | email=${reminder.email} | retryCount=${nextRetryCount} | nextStatus=${nextStatus} | message=${message}`,
        stack,
      );

      try {
        await this.reminderRepository.update(reminder.id, {
          status: nextStatus,
          retryCount: nextRetryCount,
          lastError: message,
        });

        this.logger.log(
          `PROCESS ONE REMINDER ERROR SAVED | id=${reminder.id} | status=${nextStatus} | retryCount=${nextRetryCount}`,
        );
      } catch (updateError) {
        this.logError(
          `PROCESS ONE REMINDER ERROR UPDATE FAILED | id=${reminder.id}`,
          updateError,
        );
      }
    }
  }

  async remove(id: string) {
    this.logger.log(`REMOVE REMINDER START | id=${id}`);

    try {
      const reminder = await this.reminderRepository.findOneBy({ id });

      if (!reminder) {
        this.logger.warn(`REMOVE REMINDER FAILED | not found | id=${id}`);

        throw new NotFoundException('Recordatorio no encontrado');
      }

      await this.reminderRepository.delete(id);

      this.logger.log(`REMOVE REMINDER SUCCESS | id=${id}`);

      return { ok: true };
    } catch (error) {
      this.logError(`REMOVE REMINDER ERROR | id=${id}`, error);

      throw error;
    }
  }

  async cancel(id: string) {
    this.logger.log(`CANCEL REMINDER START | id=${id}`);

    try {
      const reminder = await this.reminderRepository.findOneBy({ id });

      if (!reminder) {
        this.logger.warn(`CANCEL REMINDER FAILED | not found | id=${id}`);

        throw new NotFoundException('Recordatorio no encontrado');
      }

      if (reminder.status !== ReminderStatus.PENDING) {
        this.logger.warn(
          `CANCEL REMINDER FAILED | invalid status | id=${id} | status=${reminder.status}`,
        );

        throw new BadRequestException(
          'Solo se pueden cancelar recordatorios pendientes',
        );
      }

      reminder.status = ReminderStatus.CANCELLED;

      const saved = await this.reminderRepository.save(reminder);

      this.logger.log(
        `CANCEL REMINDER SUCCESS | id=${id} | status=${saved.status}`,
      );

      return saved;
    } catch (error) {
      this.logError(`CANCEL REMINDER ERROR | id=${id}`, error);

      throw error;
    }
  }

  private logError(context: string, error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';

    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(`${context} | message=${message}`, stack);
  }
}