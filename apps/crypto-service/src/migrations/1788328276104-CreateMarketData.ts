import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketData1788328276104 implements MigrationInterface {
  name = 'CreateMarketData1788328276104';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "market_data" ("id" BIGSERIAL NOT NULL, "symbol" character varying(20) NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "open" numeric(24,12) NOT NULL, "high" numeric(24,12) NOT NULL, "low" numeric(24,12) NOT NULL, "close" numeric(24,12) NOT NULL, "volume" numeric(30,12) NOT NULL, "turnover" numeric(24,8) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f66c35bec52b05f6eae861225e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_market_data_timestamp" ON "market_data" ("timestamp")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_market_data_symbol_timestamp" ON "market_data" ("symbol", "timestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_market_data_symbol_timestamp"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_market_data_timestamp"`);
    await queryRunner.query(`DROP TABLE "market_data"`);
  }
}
