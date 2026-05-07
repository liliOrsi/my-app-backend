import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ExpenseType, MoneyType } from '../expense.entity';
import { Transform } from 'class-transformer';

export class QueryExpenseDto {
  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsEnum(ExpenseType)
  @IsOptional()
  type?: ExpenseType;

  @IsEnum(MoneyType)
  @IsOptional()
  moneyType!: MoneyType;

  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @IsPositive()
  @IsOptional()
  categoryId?: number;
}
