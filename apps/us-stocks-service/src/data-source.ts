import 'dotenv/config';
import { DataSource } from 'typeorm';
import { MarketData } from './market-data/market-data.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [MarketData],
  migrations: ['src/migrations/*.ts'],
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});
