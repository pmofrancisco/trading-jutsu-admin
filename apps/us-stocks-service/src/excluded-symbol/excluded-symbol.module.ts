import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExcludedSymbol } from './excluded-symbol.entity';
import { ExcludedSymbolController } from './excluded-symbol.controller';
import { ExcludedSymbolService } from './excluded-symbol.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExcludedSymbol])],
  controllers: [ExcludedSymbolController],
  providers: [ExcludedSymbolService],
  // MarketDataModule filters an import against the excluded symbols and
  // rejects them on its write routes, and reads them through this service
  // rather than reaching for the repository itself.
  exports: [ExcludedSymbolService],
})
export class ExcludedSymbolModule {}
