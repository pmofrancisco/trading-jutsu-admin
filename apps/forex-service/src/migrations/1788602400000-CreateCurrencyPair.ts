import { MigrationInterface, QueryRunner } from 'typeorm';

// The tradeable markets built from `currency`. The symbol is the primary key
// rather than a surrogate id, for the same reason `currency.code` is: it is
// what the feeds, the API paths, and `market_data.symbol` already carry.
//
// `market_data.symbol` is deliberately left unconstrained for now -- existing
// rows name pairs this table does not list yet, so the foreign key would fail
// to validate, and the EOD import would start rejecting pairs that had not
// been registered first. That is a later migration, after a backfill.
export class CreateCurrencyPair1788602400000 implements MigrationInterface {
  name = 'CreateCurrencyPair1788602400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "currency_pair" ("symbol" character varying(6) NOT NULL, "base_currency_code" character varying(3) NOT NULL, "quote_currency_code" character varying(3) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_currency_pair" PRIMARY KEY ("symbol"))`,
    );

    // The symbol is derived from the two codes, so this is what keeps it from
    // ever disagreeing with them -- including for a write that never goes
    // through the service.
    await queryRunner.query(
      `ALTER TABLE "currency_pair" ADD CONSTRAINT "CHK_currency_pair_symbol" CHECK ("symbol" = "base_currency_code" || "quote_currency_code")`,
    );
    await queryRunner.query(
      `ALTER TABLE "currency_pair" ADD CONSTRAINT "CHK_currency_pair_distinct" CHECK ("base_currency_code" <> "quote_currency_code")`,
    );

    // What actually makes a pair unique: the primary key alone would allow a
    // second EURUSD row only if the check above were dropped, but this states
    // the rule in its own terms.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_currency_pair_base_quote" ON "currency_pair" ("base_currency_code", "quote_currency_code")`,
    );

    // The base-side foreign key is served by the composite index above. The
    // quote side leads no index of its own, which is what would make deleting
    // a currency scan every pair.
    await queryRunner.query(
      `CREATE INDEX "IDX_currency_pair_quote" ON "currency_pair" ("quote_currency_code")`,
    );

    // RESTRICT on both sides: deleting USD while pairs are priced in it should
    // fail loudly rather than silently take the markets with it, and an ISO code
    // is never renamed -- ON UPDATE CASCADE would rewrite the halves without
    // touching the symbol, which the CHECK above would reject anyway.
    await queryRunner.query(
      `ALTER TABLE "currency_pair" ADD CONSTRAINT "FK_currency_pair_base" FOREIGN KEY ("base_currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "currency_pair" ADD CONSTRAINT "FK_currency_pair_quote" FOREIGN KEY ("quote_currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "currency_pair"`);
  }
}
