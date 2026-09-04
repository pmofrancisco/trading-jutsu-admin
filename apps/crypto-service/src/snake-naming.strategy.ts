import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

// Postgres folds unquoted identifiers to lower case, so a camelCase column has
// to be double-quoted for the rest of its life -- `select "createdAt"` in psql,
// in a dashboard, in any consumer that never loads these entities. TypeORM
// already derives snake_case *table* names from the class name; left alone it
// takes column names from the property verbatim, which is what splits an
// identifier like `market_data."createdAt"` down the middle.
function snakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  // An explicit `@Column({ name })` is passed through untouched: it is a
  // deliberate choice about the database, not a property name to convert.
  columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    const name = customName || snakeCase(propertyName);
    return embeddedPrefixes.length
      ? `${snakeCase(embeddedPrefixes.join('_'))}_${name}`
      : name;
  }

  // `baseCurrency` joined to `code` becomes base_currency_code rather than the
  // default baseCurrencyCode.
  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
