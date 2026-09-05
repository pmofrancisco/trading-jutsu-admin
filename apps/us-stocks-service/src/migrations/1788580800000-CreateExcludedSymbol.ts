import { MigrationInterface, QueryRunner } from 'typeorm';

// The tickers the EOD import drops. The Massive grouped feed carries every
// symbol the US market quotes; this is the list of the ones not worth storing.
//
// A denylist rather than the allowlist forex-service keeps in `currency_pair`,
// and so deliberately not a foreign key on `market_data.symbol`: a constraint
// can require a referenced row to exist, not require one to be absent. The
// filtering lives in MarketDataService, which is also why excluding a symbol
// does nothing to the candles already stored for it -- delete those separately
// if they are not wanted.
export class CreateExcludedSymbol1788580800000 implements MigrationInterface {
  name = 'CreateExcludedSymbol1788580800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `symbol` is varchar(20) to match `market_data.symbol`: a longer string
    // is one no candle could carry, so a row holding it would never match.
    await queryRunner.query(
      `CREATE TABLE "excluded_symbol" ("symbol" character varying(20) NOT NULL, "reason" character varying(200), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_excluded_symbol" PRIMARY KEY ("symbol"))`,
    );

    // Symbols are stored upper-cased, and the import compares an upper-cased
    // ticker against them. A lower-cased row inserted by direct SQL would
    // never match anything -- it would sit in the list looking like it worked
    // while the symbol kept being imported. Fail that write instead.
    await queryRunner.query(
      `ALTER TABLE "excluded_symbol" ADD CONSTRAINT "CHK_excluded_symbol_upper" CHECK ("symbol" = upper("symbol"))`,
    );

    // An empty symbol would exclude nothing and match nothing; the DTO already
    // rejects one, and this says the same to a write that skips the service.
    await queryRunner.query(
      `ALTER TABLE "excluded_symbol" ADD CONSTRAINT "CHK_excluded_symbol_not_blank" CHECK ("symbol" <> '')`,
    );

    // No index beyond the primary key: the only reads are a key lookup and a
    // full scan to build the filter set, both of which it already serves.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "excluded_symbol"`);
  }
}
