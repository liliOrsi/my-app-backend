import { PartialType } from '@nestjs/mapped-types';
import { CreateReminderDto } from './create-reminders.dto';


export class UpdateNodemailerDto extends PartialType(CreateReminderDto) {}
