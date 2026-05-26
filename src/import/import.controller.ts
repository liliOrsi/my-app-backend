import {
  Body, Controller, Delete, Get, Param, Post, UploadedFile,
  UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth } from '../auth/decorators';
import { ImportService, ParsedRow } from './import.service';

@Auth()
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const rows = this.importService.parseExcel(file.buffer);
    if (rows.length === 0) throw new BadRequestException('No se pudieron leer transacciones del archivo');
    return this.importService.buildPreview(rows);
  }

  @Get('batches')
  async getBatches() {
    return this.importService.getBatches();
  }

  @Get('batches/:batchId/transactions')
  async getBatchTransactions(@Param('batchId') batchId: string) {
    return this.importService.getBatchTransactions(batchId);
  }

  @Delete('batches/:batchId')
  async deleteBatch(@Param('batchId') batchId: string) {
    return this.importService.deleteBatch(batchId);
  }

  @Delete('bbva')
  async deleteAllBbva() {
    return this.importService.deleteAllBbvaImport();
  }

  @Post('confirm')
  async confirm(
    @Body() body: { expenses: ParsedRow[]; incomes: ParsedRow[]; defaultCategoryId: number; balanceAmount?: number; balanceDate?: string },
  ) {
    return this.importService.confirmImport(
      body.expenses ?? [],
      body.incomes  ?? [],
      body.defaultCategoryId ?? 1,
      body.balanceAmount,
      body.balanceDate,
    );
  }
}
