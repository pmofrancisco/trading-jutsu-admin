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
import { MarketDataService } from './market-data.service';
import { CreateMarketDataDto } from './dto/create-market-data.dto';
import { UpdateMarketDataDto } from './dto/update-market-data.dto';
import { QueryMarketDataDto } from './dto/query-market-data.dto';
import { BulkUpsertMarketDataDto } from './dto/bulk-upsert-market-data.dto';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Post()
  create(@Body() dto: CreateMarketDataDto) {
    return this.marketDataService.create(dto);
  }

  @Post('bulk-upsert')
  bulkUpsert(@Body() dto: BulkUpsertMarketDataDto) {
    return this.marketDataService.bulkUpsert(dto.candles);
  }

  @Get()
  findAll(@Query() query: QueryMarketDataDto) {
    return this.marketDataService.findAll(query);
  }

  @Get(':symbol/ytd-performance')
  getYtdPerformance(@Param('symbol') symbol: string) {
    return this.marketDataService.getYtdPerformance(symbol);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.marketDataService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMarketDataDto) {
    return this.marketDataService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.marketDataService.remove(id);
  }
}
