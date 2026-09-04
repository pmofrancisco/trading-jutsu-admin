import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyPair } from './currency-pair.entity';
import { CurrencyPairController } from './currency-pair.controller';
import { CurrencyPairService } from './currency-pair.service';

@Module({
  imports: [TypeOrmModule.forFeature([CurrencyPair])],
  controllers: [CurrencyPairController],
  providers: [CurrencyPairService],
  // MarketDataModule filters an import against the registered pairs, and reads
  // them through this service rather than reaching for the repository itself.
  exports: [CurrencyPairService],
})
export class CurrencyPairModule {}
