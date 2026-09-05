import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketData } from './market-data.entity';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { ExcludedSymbolModule } from '../excluded-symbol/excluded-symbol.module';

@Module({
  // ExcludedSymbolModule for the symbols an import drops and the write
  // routes refuse.
  imports: [TypeOrmModule.forFeature([MarketData]), ExcludedSymbolModule],
  controllers: [MarketDataController],
  providers: [MarketDataService],
})
export class MarketDataModule {}
