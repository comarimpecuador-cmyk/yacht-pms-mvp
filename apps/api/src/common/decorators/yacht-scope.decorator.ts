import { SetMetadata } from '@nestjs/common';

export const YACHT_SCOPE_KEY = 'yachtScope';
export const YachtScope = () => SetMetadata(YACHT_SCOPE_KEY, true);
