import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const numericTransformer = {
  to: (value?: number) => value,
  from: (value?: string) =>
    value === null || value === undefined ? value : Number(value),
};

// Crypto prices span roughly 1e-12 (long-tail tokens quoted in USD, and thin
// alt/BTC pairs) to 1e5, so the four decimals the equity services store would
// round most of the market to zero. Twelve covers the whole range; `numeric` is
// variable-length, so the unused decimals cost nothing on a BTC row.
const PRICE_COLUMN = {
  type: 'numeric',
  precision: 24,
  scale: 12,
  transformer: numericTransformer,
} as const;

@Entity('market_data')
@Index('IDX_market_data_symbol_timestamp', ['symbol', 'timestamp'], {
  unique: true,
})
@Index('IDX_market_data_timestamp', ['timestamp'])
export class MarketData {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column(PRICE_COLUMN)
  open: number;

  @Column(PRICE_COLUMN)
  high: number;

  @Column(PRICE_COLUMN)
  low: number;

  @Column(PRICE_COLUMN)
  close: number;

  // Base-asset units, which are fractional in crypto -- a candle can trade
  // 0.00341 BTC -- so this is numeric rather than the equity services' bigint.
  @Column({
    type: 'numeric',
    precision: 30,
    scale: 12,
    transformer: numericTransformer,
  })
  volume: number;

  // Quote-currency value traded. Eight decimals is ample for a currency total.
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 8,
    transformer: numericTransformer,
  })
  turnover: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
