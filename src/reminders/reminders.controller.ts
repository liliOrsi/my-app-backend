import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators';
import { CreateReminderDto } from './dto/create-reminders.dto';
import { RemindersService } from './reminders.service';

@Auth()
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  create(@Body() dto: CreateReminderDto) {
    return this.remindersService.create(dto);
  }

  @Get()
  findAll() {
    return this.remindersService.findAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
  return this.remindersService.remove(id);
}

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
  return this.remindersService.cancel(id);
}
}