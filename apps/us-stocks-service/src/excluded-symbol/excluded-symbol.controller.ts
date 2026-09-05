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
import { ExcludedSymbolService } from './excluded-symbol.service';
import { ParseExcludedSymbolPipe } from './excluded-symbol.pipe';
import { CreateExcludedSymbolDto } from './dto/create-excluded-symbol.dto';
import { QueryExcludedSymbolDto } from './dto/query-excluded-symbol.dto';
import { BulkUpsertExcludedSymbolDto } from './dto/bulk-upsert-excluded-symbol.dto';

// No PATCH: the symbol is the primary key, and `reason` is the only other
// column -- amending it is what the bulk upsert already does, and a route to
// edit one field of a reference row earns less than it costs.
@ApiTags('excluded-symbols')
@Controller('excluded-symbols')
export class ExcludedSymbolController {
  constructor(private readonly excludedSymbolService: ExcludedSymbolService) {}

  @ApiOperation({ summary: 'Exclude a single symbol' })
  @Post()
  create(@Body() dto: CreateExcludedSymbolDto) {
    return this.excludedSymbolService.create(dto);
  }

  @ApiOperation({ summary: 'Bulk upsert excluded symbols' })
  @Post('bulk-upsert')
  bulkUpsert(@Body() dto: BulkUpsertExcludedSymbolDto) {
    return this.excludedSymbolService.bulkUpsert(dto.excludedSymbols);
  }

  @ApiOperation({ summary: 'List excluded symbols' })
  @Get()
  findAll(@Query() query: QueryExcludedSymbolDto) {
    return this.excludedSymbolService.findAll(query);
  }

  @ApiOperation({ summary: 'Get an excluded symbol' })
  @Get(':symbol')
  findOne(@Param('symbol', ParseExcludedSymbolPipe) symbol: string) {
    return this.excludedSymbolService.findOne(symbol);
  }

  @ApiOperation({ summary: 'Stop excluding a symbol' })
  @Delete(':symbol')
  remove(@Param('symbol', ParseExcludedSymbolPipe) symbol: string) {
    return this.excludedSymbolService.remove(symbol);
  }
}
