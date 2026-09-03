import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : Number(value),
};

// Six decimals is the pipette precision forex is quoted at, and twelve integer
// digits leave room for a pair quoted against a hyperinflated currency, well
// past the ~157 of USDJPY. `numeric` is variable-length, so the headroom costs
// nothing on an EURUSD row.
const PRICE_COLUMN = {
  type: 'numeric',
  precision: 18,
  scale: 6,
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

  // Spot forex trades over the counter with no central tape, so a candle
  // carries no authoritative volume. Brokers that do report one give either a
  // tick count or fractional lots, hence numeric rather than the equity
  // services' bigint -- and null when the feed reports nothing at all.
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 8,
    nullable: true,
    transformer: numericTransformer,
  })
  volume: number | null;

  // Quote-currency value traded. Null for the same reason as volume; no spot
  // forex feed reports a market-wide traded value.
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  turnover: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
