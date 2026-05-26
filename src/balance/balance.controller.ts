import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Auth } from '../auth/decorators';
import { BalanceService } from './balance.service';

class SetBalanceDto {
  @IsNumber() @IsPositive() amount!: number;
  @IsDateString() date!: string;
  @IsString() @IsOptional() source?: string;
  @IsIn(['banco', 'efectivo']) @IsOptional() account?: string;
}

@Auth()
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  getAll() {
    return this.balanceService.getAll();
  }

  @Get('history')
  getHistory(@Query('account') account?: string) {
    return this.balanceService.getHistory(account);
  }

  @Post()
  set(@Body() dto: SetBalanceDto) {
    return this.balanceService.set(dto.amount, dto.date, dto.source, dto.account ?? 'banco');
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.balanceService.deleteById(id);
  }
}
