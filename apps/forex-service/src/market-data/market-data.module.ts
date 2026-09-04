import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketData } from './market-data.entity';
import { CurrencyPairModule } from '../currency-pair/currency-pair.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [TypeOrmModule.forFeature([MarketData]), CurrencyPairModule],
  controllers: [MarketDataController],
  providers: [MarketDataService],
})
export class MarketDataModule {}
