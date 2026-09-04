import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrencyService } from './currency.service';
import { ParseCurrencyCodePipe } from './currency-code.pipe';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { QueryCurrencyDto } from './dto/query-currency.dto';
import { BulkUpsertCurrencyDto } from './dto/bulk-upsert-currency.dto';

@ApiTags('currencies')
@Controller('currencies')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @ApiOperation({ summary: 'Create a single currency' })
  @Post()
  create(@Body() dto: CreateCurrencyDto) {
    return this.currencyService.create(dto);
  }

  @ApiOperation({ summary: 'Bulk upsert currencies' })
  @Post('bulk-upsert')
  bulkUpsert(@Body() dto: BulkUpsertCurrencyDto) {
    return this.currencyService.bulkUpsert(dto.currencies);
  }

  @ApiOperation({ summary: 'List currencies' })
  @Get()
  findAll(@Query() query: QueryCurrencyDto) {
    return this.currencyService.findAll(query);
  }

  @ApiOperation({ summary: 'Get a currency by ISO 4217 code' })
  @Get(':code')
  findOne(@Param('code', ParseCurrencyCodePipe) code: string) {
    return this.currencyService.findOne(code);
  }

  @ApiOperation({ summary: 'Update a currency' })
  @Patch(':code')
  update(
    @Param('code', ParseCurrencyCodePipe) code: string,
    @Body() dto: UpdateCurrencyDto,
  ) {
    return this.currencyService.update(code, dto);
  }

  @ApiOperation({ summary: 'Delete a currency' })
  @Delete(':code')
  remove(@Param('code', ParseCurrencyCodePipe) code: string) {
    return this.currencyService.remove(code);
  }
}
