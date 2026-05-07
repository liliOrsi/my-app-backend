import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './expense.entity';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { CategoriesModule } from '../categories/categories.module';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expense]), CategoriesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExchangeRateService],
})
export class ExpensesModule {}
