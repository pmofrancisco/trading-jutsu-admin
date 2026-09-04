import { MigrationInterface, QueryRunner } from 'typeorm';

// Postgres lower-cases unquoted identifiers, so the camelCase columns could
// only ever be read as `"createdAt"`. Renaming them is metadata-only -- no
// table rewrite, no lock beyond the brief ACCESS EXCLUSIVE each statement
// takes -- but it does have to ship together with the SnakeNamingStrategy that
// teaches TypeORM the new names.
export class SnakeCaseTimestampColumns1788516000001 implements MigrationInterface {
  name = 'SnakeCaseTimestampColumns1788516000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_data" RENAME COLUMN "createdAt" TO "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_data" RENAME COLUMN "updatedAt" TO "updated_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "market_data" RENAME COLUMN "updated_at" TO "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_data" RENAME COLUMN "created_at" TO "createdAt"`,
    );
  }
}
