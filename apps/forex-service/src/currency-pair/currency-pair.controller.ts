import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrencyPairService } from './currency-pair.service';
import { ParseCurrencyPairSymbolPipe } from './currency-pair-symbol.pipe';
import { CreateCurrencyPairDto } from './dto/create-currency-pair.dto';
import { QueryCurrencyPairDto } from './dto/query-currency-pair.dto';
import { BulkUpsertCurrencyPairDto } from './dto/bulk-upsert-currency-pair.dto';

// No PATCH: a pair's only columns are its symbol and the two codes the symbol
// is built from, so there is nothing to edit. Changing the base currency of
// EURUSD does not amend a row, it names a different market.
@ApiTags('currency-pairs')
@Controller('currency-pairs')
export class CurrencyPairController {
  constructor(private readonly currencyPairService: CurrencyPairService) {}

  @ApiOperation({ summary: 'Create a single currency pair' })
  @Post()
  create(@Body() dto: CreateCurrencyPairDto) {
    return this.currencyPairService.create(dto);
  }

  @ApiOperation({ summary: 'Bulk upsert currency pairs' })
  @Post('bulk-upsert')
  bulkUpsert(@Body() dto: BulkUpsertCurrencyPairDto) {
    return this.currencyPairService.bulkUpsert(dto.currencyPairs);
  }

  @ApiOperation({ summary: 'List currency pairs' })
  @Get()
  findAll(@Query() query: QueryCurrencyPairDto) {
    return this.currencyPairService.findAll(query);
  }

  @ApiOperation({ summary: 'Get a currency pair by symbol' })
  @Get(':symbol')
  findOne(@Param('symbol', ParseCurrencyPairSymbolPipe) symbol: string) {
    return this.currencyPairService.findOne(symbol);
  }

  @ApiOperation({ summary: 'Delete a currency pair' })
  @Delete(':symbol')
  remove(@Param('symbol', ParseCurrencyPairSymbolPipe) symbol: string) {
    return this.currencyPairService.remove(symbol);
  }
}
