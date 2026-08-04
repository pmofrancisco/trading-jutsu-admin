import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketData1785852388546 implements MigrationInterface {
  name = 'CreateMarketData1785852388546';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "market_data" ("id" BIGSERIAL NOT NULL, "symbol" character varying(20) NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "open" numeric(12,4) NOT NULL, "high" numeric(12,4) NOT NULL, "low" numeric(12,4) NOT NULL, "close" numeric(12,4) NOT NULL, "volume" bigint NOT NULL, "turnover" numeric(18,4) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f66c35bec52b05f6eae861225e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_market_data_symbol_timestamp" ON "market_data"  ("symbol", "timestamp") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_market_data_symbol_timestamp"`,
    );
    await queryRunner.query(`DROP TABLE "market_data"`);
  }
}
