import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketDataTimestampIndex1786156162122 implements MigrationInterface {
  name = 'AddMarketDataTimestampIndex1786156162122';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_market_data_timestamp" ON "market_data" ("timestamp" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_market_data_timestamp"`);
  }
}
