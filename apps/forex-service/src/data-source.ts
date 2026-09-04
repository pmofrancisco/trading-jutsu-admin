import 'dotenv/config';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';
import { MarketData } from './market-data/market-data.entity';
import { Currency } from './currency/currency.entity';
import { CurrencyPair } from './currency-pair/currency-pair.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [MarketData, Currency, CurrencyPair],
  migrations: ['src/migrations/*.ts'],
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});
