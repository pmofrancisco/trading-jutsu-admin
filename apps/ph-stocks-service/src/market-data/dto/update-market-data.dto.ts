import { PartialType } from '@nestjs/mapped-types';
import { CreateMarketDataDto } from './create-market-data.dto';

export class UpdateMarketDataDto extends PartialType(CreateMarketDataDto) {}
