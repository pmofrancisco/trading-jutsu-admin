import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  EXCLUDED_SYMBOL_MAX_LENGTH,
  EXCLUDED_SYMBOL_REASON_MAX_LENGTH,
} from './excluded-symbol.constants';

// The tickers this service does not store. The Massive grouped feed carries
// every symbol the US market quotes, most of which are not worth keeping --
// test tickers, delisted shells, instrument types this service does not model.
// One row per symbol to drop.
//
// This is a denylist rather than the allowlist forex-service keeps in
// `currency_pair`: the US feed is broad and mostly wanted, where the forex feed
// is broad and mostly not. For the same reason it is not a foreign key on
// `market_data.symbol` -- a constraint can require a row to exist, not require
// one to be absent, so the filtering is done in the service.
@Entity('excluded_symbol')
export class ExcludedSymbol {
  // The ticker is the natural key, for the same reason `currency.code` is in
  // forex-service: it is what the feed, the API path, and every `market_data`
  // row already carry, so a surrogate id would only add a column to join
  // through. Stored upper-cased -- see `normalizeSymbol`.
  @PrimaryColumn({ type: 'varchar', length: EXCLUDED_SYMBOL_MAX_LENGTH })
  symbol: string;

  // Why this symbol is excluded. Nullable because a list this size is often
  // seeded in bulk from a rule that needs no per-row note, but a symbol added
  // by hand months from now is worth explaining.
  @Column({
    type: 'varchar',
    length: EXCLUDED_SYMBOL_REASON_MAX_LENGTH,
    nullable: true,
  })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
