import type { FromSchema } from 'json-schema-to-ts';
import * as schemas from './schemas';
export type CreateATokenBodyParam = FromSchema<typeof schemas.CreateAToken.body>;
export type CreateATokenResponse200 = FromSchema<typeof schemas.CreateAToken.response['200']>;
export type RetrieveATokenMetadataParam = FromSchema<typeof schemas.RetrieveAToken.metadata>;
export type RetrieveATokenResponse200 = FromSchema<typeof schemas.RetrieveAToken.response['200']>;
export type RetrieveATokenResponse400 = FromSchema<typeof schemas.RetrieveAToken.response['400']>;
