import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Currency } from '../currency/currency.entity';
import { CURRENCY_CODE_LENGTH } from '../currency/currency.constants';
import { CURRENCY_PAIR_SYMBOL_LENGTH } from './currency-pair.constants';

// The tradeable pairs built from `currency`: one row per market, naming which
// currency is being bought (base) and which it is priced in (quote). EURUSD at
// 1.08 is one euro for 1.08 dollars.
@Entity('currency_pair')
// The symbol is a concatenation, so it cannot collide without the halves
// colliding too -- but only if something enforces that, and the CHECK
// constraint lives in the database rather than here. This index is what makes
// a duplicate pair impossible on its own terms.
@Index(
  'IDX_currency_pair_base_quote',
  ['baseCurrencyCode', 'quoteCurrencyCode'],
  {
    unique: true,
  },
)
// The base-side foreign key is served by the composite index above; the quote
// side has no leading column of its own, which is what would make deleting a
// currency scan the whole table.
@Index('IDX_currency_pair_quote', ['quoteCurrencyCode'])
export class CurrencyPair {
  // Same reasoning as `currency.code`: the symbol is what every feed, path
  // param, and `market_data` row already carries, so a surrogate id would only
  // add a column to join through. It is derived from the two codes rather than
  // supplied -- see `toSymbol`.
  @PrimaryColumn({ type: 'varchar', length: CURRENCY_PAIR_SYMBOL_LENGTH })
  symbol: string;

  @Column({ type: 'varchar', length: CURRENCY_CODE_LENGTH })
  baseCurrencyCode: string;

  @Column({ type: 'varchar', length: CURRENCY_CODE_LENGTH })
  quoteCurrencyCode: string;

  // The scalar columns above are what the service reads and writes; these
  // relations exist so a query can join to the currency rows without a second
  // round trip. `onDelete` here only documents intent -- the migration is
  // hand-written, so the constraint itself is declared there.
  @ManyToOne(() => Currency, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'base_currency_code', referencedColumnName: 'code' })
  baseCurrency: Currency;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'quote_currency_code', referencedColumnName: 'code' })
  quoteCurrency: Currency;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
