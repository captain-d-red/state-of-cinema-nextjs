import raw from './films.json';
import { parseCatalogue } from './parse';

export type { Catalogue, Film } from './parse';

export const catalogue = parseCatalogue(raw);
