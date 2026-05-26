import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Auth } from '../auth/decorators';
import { IncomesService } from './incomes.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { QueryIncomeDto } from './dto/query-income.dto';

@Auth()
@Controller('incomes')
export class IncomesController {
  constructor(private readonly incomesService: IncomesService) {}

  @Post()
  create(@Body() dto: CreateIncomeDto) {
    return this.incomesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryIncomeDto) {
    return this.incomesService.findAll(query);
  }

  @Get('total')
  getTotal(@Query() query: QueryIncomeDto) {
    return this.incomesService.getTotalByPeriod(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.incomesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIncomeDto) {
    return this.incomesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.incomesService.remove(id);
  }
}
