import 'dotenv/config';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';
import { MarketData } from './market-data/market-data.entity';
import { ExcludedSymbol } from './excluded-symbol/excluded-symbol.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [MarketData, ExcludedSymbol],
  migrations: ['src/migrations/*.ts'],
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});
