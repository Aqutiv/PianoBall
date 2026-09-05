/**
 * Orders used by saves written before TuneRecord.passed existed.
 * Keep these historical lists frozen: inserting a course must not change the
 * successor whose stored unlock proves an old record had passed.
 * Strings only, so loading progress never imports the music library.
 */
export const LEGACY_ORDERS: Readonly<Record<string, readonly string[]>> = {
  playtune: [
    'first-light', 'ode-to-joy', 'twinkle', 'amazing-grace', 'scarborough-fair',
    'drift', 'greensleeves', 'fur-elise', 'londonderry-air', 'minuet-in-g',
    'gymnopedie', 'two-hands', 'canon-in-d', 'jesu-joy',
  ],
  playchords: [
    'chord-ground', 'chord-three', 'drift', 'chord-march', 'ode-to-joy', 'twinkle',
    'canon-in-d', 'londonderry-air', 'first-light', 'two-hands', 'amazing-grace',
    'gymnopedie', 'scarborough-fair', 'greensleeves', 'fur-elise', 'minuet-in-g', 'jesu-joy',
  ],
};
