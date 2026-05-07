import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ExpenseType, MoneyType } from '../expense.entity';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsDateString()
  date!: string;

  @IsEnum(ExpenseType)
  type!: ExpenseType;

  @IsEnum(MoneyType)
  moneyType!: MoneyType;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  recurringDay?: number;

  @IsInt()
  @IsPositive()
  categoryId!: number;
}
