// Self-hosted brand faces. The design reference asks for Poppins, but Poppins
// ships no Cyrillic, and ru/uz are the primary runtime locales — so we load the
// reference's documented fallback pair (Montserrat display + Manrope body),
// both of which carry cyrillic and cyrillic-ext subsets.
import '@fontsource-variable/montserrat';
import '@fontsource-variable/manrope';
import './styles.css';

export * from './asset';
export * from './component';
export * from './layout';
export * from './util';
