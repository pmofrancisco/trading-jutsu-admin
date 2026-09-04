import { MigrationInterface, QueryRunner } from 'typeorm';

// The backfill `CreateCurrencyPair` deferred: `market_data.symbol` becomes a
// foreign key into `currency_pair`, so a candle can only name a market that has
// been registered.
//
// The rows that name an unregistered pair are deleted rather than kept, on the
// grounds that `currency_pair` is the list of markets this service tracks --
// anything outside it was swept up by an unfiltered import, not asked for. That
// is most of the table, and it is not recoverable from `down`: the constraint
// comes back off, but the candles stay gone. Re-import the dates in question
// after registering the pairs.
export class LinkMarketDataToCurrencyPair1788688800000 implements MigrationInterface {
  name = 'LinkMarketDataToCurrencyPair1788688800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NOT EXISTS rather than NOT IN: a NULL anywhere in the subquery makes
    // `NOT IN` match nothing at all, silently deleting no rows. The column is
    // NOT NULL today, but the semantics should not depend on that.
    await queryRunner.query(
      `DELETE FROM "market_data" md WHERE NOT EXISTS (SELECT 1 FROM "currency_pair" cp WHERE cp."symbol" = md."symbol")`,
    );

    // RESTRICT on both sides, matching the currency foreign keys: deleting a
    // pair that has price history should fail loudly rather than take years of
    // candles with it, and a symbol is never renamed in place -- it is derived
    // from two ISO codes, which are themselves immutable.
    //
    // The delete-side check is served by `IDX_market_data_symbol_timestamp`,
    // which leads with `symbol`; without it, removing a pair would scan every
    // candle.
    await queryRunner.query(
      `ALTER TABLE "market_data" ADD CONSTRAINT "FK_market_data_currency_pair" FOREIGN KEY ("symbol") REFERENCES "currency_pair"("symbol") ON DELETE RESTRICT ON UPDATE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_data" DROP CONSTRAINT "FK_market_data_currency_pair"`,
    );
  }
}
