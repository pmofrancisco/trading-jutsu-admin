import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketData } from './market-data.entity';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [TypeOrmModule.forFeature([MarketData])],
  controllers: [MarketDataController],
  providers: [MarketDataService],
})
export class MarketDataModule {}
