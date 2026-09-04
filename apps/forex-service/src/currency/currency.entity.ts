import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CURRENCY_CODE_LENGTH,
  CURRENCY_NAME_MAX_LENGTH,
} from './currency.constants';

// A reference table of ISO 4217 codes -- the halves a `market_data.symbol` pair
// is built from, so EURUSD is EUR against USD and XAUUSD gold against the
// dollar.
@Entity('currency')
export class Currency {
  // The ISO code is the natural key: assigned upstream, immutable, and what
  // every caller already has in hand. A surrogate id would only add a column to
  // join through -- unlike `market_data`, whose rows carry no stable key.
  @PrimaryColumn({ type: 'varchar', length: CURRENCY_CODE_LENGTH })
  code: string;

  @Column({ type: 'varchar', length: CURRENCY_NAME_MAX_LENGTH })
  name: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
