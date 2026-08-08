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

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  open: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  high: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  low: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  close: number;

  @Column({ type: 'bigint', transformer: numericTransformer })
  volume: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  turnover: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
