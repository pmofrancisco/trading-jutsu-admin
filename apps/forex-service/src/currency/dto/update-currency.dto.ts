import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCurrencyDto } from './create-currency.dto';

// `code` is the primary key and ISO-assigned, so it is the row's identity
// rather than one of its fields -- renaming a currency changes `name`. Omitting
// it keeps the PK from being mutable through a PATCH body, and keeps Swagger
// honest about what the route accepts.
export class UpdateCurrencyDto extends PartialType(
  OmitType(CreateCurrencyDto, ['code'] as const),
) {}
