import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';
import { MarketDataModule } from './market-data/market-data.module';
import { CurrencyModule } from './currency/currency.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      namingStrategy: new SnakeNamingStrategy(),
      autoLoadEntities: true,
      synchronize: false,
      ssl: process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    }),
    MarketDataModule,
    CurrencyModule,
  ],
})
export class AppModule {}
