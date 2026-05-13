import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateReminderDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsDateString()
  remindAt!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080) // máximo 7 días antes
  notifyBeforeMinutes?: number;
}