import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/expense.entity';
import { Income } from '../incomes/income.entity';
import { Category } from '../categories/category.entity';
import { IncomesModule } from '../incomes/incomes.module';
import { BalanceModule } from '../balance/balance.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Income, Category]), IncomesModule, BalanceModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
