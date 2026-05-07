import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense, MoneyType } from './expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { CategoriesService } from '../categories/categories.service';
import { ExchangeRateService } from './exchange-rate.service';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    private readonly categoriesService: CategoriesService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async create(dto: CreateExpenseDto): Promise<Expense> {
    try {
      await this.categoriesService.findOne(dto.categoryId);
      const expense = this.expenseRepository.create(dto);

      if (dto.moneyType === MoneyType.USD) {
        expense.usdToArsRate = await this.exchangeRateService.getUsdToArsOfficialRate();
      }

      const saved = await this.expenseRepository.save(expense);
      this.logger.log(`Created expense: ${saved.description} $${saved.amount} (id: ${saved.id})`);
      return saved;
    } catch (error: unknown) {
      this.logger.error(`Failed to create expense: ${(error as Error).message}`);
      throw error;
    }
  }

  async findAll(query: QueryExpenseDto): Promise<Expense[]> {
    try {
      const qb = this.expenseRepository
        .createQueryBuilder('expense')
        .leftJoinAndSelect('expense.category', 'category')
        .orderBy('expense.date', 'DESC');

      if (query.from) qb.andWhere('expense.date >= :from', { from: query.from });
      if (query.to) qb.andWhere('expense.date <= :to', { to: query.to });
      if (query.type) qb.andWhere('expense.type = :type', { type: query.type });
      if (query.categoryId) qb.andWhere('expense.categoryId = :categoryId', { categoryId: query.categoryId });

      return await qb.getMany();
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch expenses: ${(error as Error).message}`);
      throw error;
    }
  }

  async findOne(id: number): Promise<Expense> {
    try {
      const expense = await this.expenseRepository.findOne({ where: { id } });
      if (!expense) throw new NotFoundException(`Expense #${id} not found`);
      return expense;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch expense #${id}: ${(error as Error).message}`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateExpenseDto): Promise<Expense> {
    try {
      const expense = await this.findOne(id);
      if (dto.categoryId) await this.categoriesService.findOne(dto.categoryId);
      Object.assign(expense, dto);
      const updated = await this.expenseRepository.save(expense);
      this.logger.log(`Updated expense #${id}`);
      return updated;
    } catch (error: unknown) {
      this.logger.error(`Failed to update expense #${id}: ${(error as Error).message}`);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      const expense = await this.findOne(id);
      await this.expenseRepository.remove(expense);
      this.logger.log(`Deleted expense #${id}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete expense #${id}: ${(error as Error).message}`);
      throw error;
    }
  }

  async getTotalsByCategory(query: QueryExpenseDto): Promise<{ category: string; total: number }[]> {
    try {
      const qb = this.expenseRepository
        .createQueryBuilder('expense')
        .select('category.name', 'category')
        .addSelect('SUM(expense.amount)', 'total')
        .leftJoin('expense.category', 'category')
        .groupBy('category.name')
        .orderBy('total', 'DESC');

      if (query.from) qb.andWhere('expense.date >= :from', { from: query.from });
      if (query.to) qb.andWhere('expense.date <= :to', { to: query.to });
      if (query.type) qb.andWhere('expense.type = :type', { type: query.type });

      return await qb.getRawMany();
    } catch (error: unknown) {
      this.logger.error(`Failed to get totals by category: ${(error as Error).message}`);
      throw error;
    }
  }
}
