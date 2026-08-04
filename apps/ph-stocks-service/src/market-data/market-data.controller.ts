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
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { CreateMarketDataDto } from './dto/create-market-data.dto';
import { UpdateMarketDataDto } from './dto/update-market-data.dto';
import { QueryMarketDataDto } from './dto/query-market-data.dto';
import { BulkUpsertMarketDataDto } from './dto/bulk-upsert-market-data.dto';

@ApiTags('market-data')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @ApiOperation({ summary: 'Create a single market-data candle' })
  @Post()
  create(@Body() dto: CreateMarketDataDto) {
    return this.marketDataService.create(dto);
  }

  @ApiOperation({ summary: 'Bulk upsert market-data candles' })
  @Post('bulk-upsert')
  bulkUpsert(@Body() dto: BulkUpsertMarketDataDto) {
    return this.marketDataService.bulkUpsert(dto.candles);
  }

  @ApiOperation({ summary: 'List market-data candles' })
  @Get()
  findAll(@Query() query: QueryMarketDataDto) {
    return this.marketDataService.findAll(query);
  }

  @ApiOperation({ summary: 'Get year-to-date performance for a symbol' })
  @ApiParam({ name: 'symbol', example: 'JFC' })
  @Get(':symbol/ytd-performance')
  getYtdPerformance(@Param('symbol') symbol: string) {
    return this.marketDataService.getYtdPerformance(symbol);
  }

  @ApiOperation({ summary: 'Get a market-data candle by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.marketDataService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a market-data candle' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMarketDataDto) {
    return this.marketDataService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete a market-data candle' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.marketDataService.remove(id);
  }
}
