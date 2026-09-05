import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import {
  EXCLUDED_SYMBOL_MESSAGE,
  EXCLUDED_SYMBOL_REGEX,
  normalizeSymbol,
} from './excluded-symbol.constants';

// A path parameter never goes through a DTO, so `/excluded-symbols/zvzzt`
// would otherwise reach the repository lower-cased and 404 for a row that
// exists. Symbols are stored upper-cased, so the path is normalized the same
// way the body is.
@Injectable()
export class ParseExcludedSymbolPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const symbol = normalizeSymbol(value);
    if (typeof symbol !== 'string' || !EXCLUDED_SYMBOL_REGEX.test(symbol)) {
      throw new BadRequestException(
        `Invalid symbol "${value}"; ${EXCLUDED_SYMBOL_MESSAGE}`,
      );
    }
    return symbol;
  }
}
