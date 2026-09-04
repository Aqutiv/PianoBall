/**
 * The build stamp, substituted by Vite's `define` as the config loads.
 *
 * Compile-time constants rather than a module: there is nothing to import at
 * run time, which is why they are declared here instead. Nothing outside
 * `src/app/build.ts` should read them — the rest of the app sees one typed
 * object rather than three bare globals.
 *
 * This file must stay free of `import` and `export`: either one turns it into
 * a module, and these stop being global.
 */

/** When the bundle was built, UTC `YYYY-MM-DD HH:MM`. */
declare const __BUILD_DATE__: string;

/** How many commits were behind it, or `local` where git could not say. */
declare const __BUILD_RUN__: string;

/** The short commit it was built from, or '' where there was nothing to ask. */
declare const __BUILD_SHA__: string;
