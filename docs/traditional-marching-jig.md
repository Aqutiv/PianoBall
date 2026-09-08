# Yankee Doodle and The Irish Washerwoman

These arrangements were checked against the historical score facsimiles on 8 September 2026. The melodies are entered as notes and played by PianoBall's existing synthesizer. No recording, modern arrangement, or source scan is bundled.

## Yankee Doodle

Source: S. S. Stewart, *Yankee Doodle, with Variations*, Philadelphia: S. S. Stewart, 1880, printed music page 2 (PDF page 2, following the cover). The selected passage is the three systems before **1st Var.**

- [Library of Congress item and public-domain statement](https://www.loc.gov/item/2023835419/)
- [IMSLP facsimile listing](https://imslp.org/wiki/Variations_on_Yankee_Doodle_%28Stewart%2C_Samuel_Swain%29)
- [Inspected facsimile PDF](https://s9.imslp.org/files/imglnks/usimg/f/f4/IMSLP797176-PMLP1258395-Stewart_S_S-Yankee_Doodle.pdf)
- [Library of Congress history of the marching air](https://www.loc.gov/collections/patriotic-melodies/articles-and-essays/yankee-doodle/)

The source is in A major and 2/4. It contains an eighth-note pickup followed by three eight-bar statements: the opening strain, a chorus, and a chordal chorus in the upper register. There are no repeat signs within this selected passage. The chart is a single-line reduction transposed to C, with the chordal chorus folded into the same register as the preceding chorus. It keeps the source's dotted-eighth/sixteenth figures and the altered chorus cadence. Banjo chord and bass doublings are omitted from the melody; the very short upper-voice releases in the chordal passage are normalized to the underlying melodic durations. The final tonic is held through the concluding bass motion.

One chart beat is an eighth note: `beatsPerBar = 4`, `pickup = 1`, and the complete passage ends at beat `97`. The deliberately slow practice tempo is **eighth note = 132**, equivalent to **quarter note = 66**, approximately 44.1 seconds. Its shortest required onset interval is a sixteenth, approximately 227 ms, meeting the course's 220 ms floor without straightening the dotted rhythm. Eighth-note chart units preserve the exact audible performance while keeping the falling-note approach inside the existing eight-onset density limit.

The automatic piano duet uses freshly authored root attacks and chord answers. The separate playable Backing part alternates roots and fifths before its closing chord. The restrained synthesized side-drum pulse and quiet bass-drum downbeats is a new marching accompaniment appropriate to the documented marching-air tradition; it is not represented as Stewart's original percussion part.

## The Irish Washerwoman

Source: Francis O'Neill and James O'Neill, *The Dance Music of Ireland: 1001 Gems*, Chicago: Lyon & Healy, 1907, no. **317**, printed title **The Irishwoman**, printed page **67**, PDF page **69**. The whole tune is used, including the repeat at the end of each strain.

- [University of Rochester / Sibley Music Library record](https://hdl.handle.net/1802/25425)
- [Inspected university facsimile PDF](https://urresearch.rochester.edu/fileDownloadForInstitutionalItem.action?itemId=25533&itemFileId=85196)
- [IMSLP edition information](https://imslp.org/wiki/The_Dance_Music_of_Ireland_%28O%27Neill%2C_Francis%29)

The melody remains in G major, in the score's **6/8 double-jig meter**, with the complete **AABB** form. One chart beat is an eighth note: `beatsPerBar = 6`. Each A strain begins with D5-C5 as two sixteenths, `0.5 + 0.5` chart beats; each B strain begins with a G5 eighth. Thus `pickup = 1`, not half a beat. Each eight-bar strain includes its pickup and a shortened five-eighth closing bar, totaling 48 chart beats. The full AABB passage is exactly 192 chart beats, with first complete downbeats at 1, 49, 97, and 145. The final shortened bar is retained rather than padded into an invented extra beat.

The practice tempo is **eighth note = 132**, approximately 87.3 seconds. Each opening sixteenth lasts approximately 227 ms. This is a slow practice rendition of a double jig; it retains the two groups of three and is not played as three waltz beats.

The new harp accompaniment follows the two dotted-quarter pulses. Harmony entries are segmented at those pulses, including identical adjacent chords; this leaves the harmony unchanged. The final chord sustains across the identical final tonic entries. Its playable Backing part is written independently from the automatic duet, with bass and fifth attacks and small chord answers. Quiet low-tom accents on the two main pulses, plus light rim taps, suggest a restrained contemporary frame-drum or foot-tap accompaniment using existing sounds. These additions are not claimed to appear in O'Neill's unaccompanied melody score. Both roles use felt piano for the tune itself.

## Verification

`tests/marching-jig.test.ts` checks the source openings, Yankee Doodle's three-statement form and dotted figures, the jig's exact repeats and shortened endings, chord continuity, independent backing parts, 25/32/49/61/76/88-key octave fits, the 220 ms onset floor, and drum alignment/exclusive ending bounds. Both historical melodies keep `origin: 'classic'`; percussion is opt-in authored track data, never inferred from that category.

