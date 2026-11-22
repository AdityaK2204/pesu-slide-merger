# Slide Merger for PESU Academy

A Chrome / Edge / Brave extension for [PESU Academy](https://www.pesuacademy.com/Academy/)
by **Aditya Kalloli**. One click downloads every **slide deck** or every
**notes** file in a unit, converts PowerPoint and Word files to PDF, and merges
everything, in class order, into a single PDF with a bookmark for each class.

> Unofficial. Not affiliated with or endorsed by PES University. It only fetches
> files your own PESU Academy login can already open.

## Install

**From the Releases page (no build step):**

1. Download `slide-merger-for-pesu-academy-<version>.zip` from
   [Releases](https://github.com/AdityaK2204/pesu-slide-merger/releases) and unzip it.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).

**From source:** clone this repo, run `node tools/fetch-libreoffice.mjs` once
(downloads the two LibreOffice files that are too big for git and checks their
SHA-256), then **Load unpacked** on the repo folder.

The extension is about 245 MB because it contains a full copy of LibreOffice
(compiled to WebAssembly) for the PowerPoint/Word conversion. Nothing is
downloaded or uploaded when you use it. See [PRIVACY.md](PRIVACY.md).

## Use

1. Log in to PESU Academy, go to **My Courses** and click a course.
2. Pick a unit tab. A bar appears just under the tabs.
3. Choose **Slides** or **Notes**, then click **Download Unit N slides/notes**.
   **All units** saves one merged PDF per unit.

Files are saved to `Downloads/PESU Slides/<course code and name>/`, e.g.
`Unit 1 slides - Introduction, Performance Metrics….pdf` and
`Unit 1 notes - Introduction, Performance Metrics….pdf`.

PESU Academy can be slow to serve files, so a big unit can take a minute or two.
The first PowerPoint/Word conversion after the browser starts takes a few extra
seconds while the converter starts up.

## PowerPoint and Word files

Decks and notes uploaded as `.pptx`, `.ppt`, `.docx`, `.doc` (also `.pps(x)`,
`.pot(x)`, `.dot(x)`, `.odp`, `.odt`, `.rtf`, `.xls(x)`, `.ods`) are converted
to PDF inside the extension and merged at their place in the sequence. The
converted pages keep real, selectable text.

If a file can't be converted (or isn't an Office file at all, like a `.zip`), the
merged PDF gets a placeholder page at that spot naming the file, and the original
is saved next to the PDF, so nothing goes missing. The bar lists every file that
was converted or skipped.

## What "right sequence" means here

- Classes are merged in the order the unit's class table lists them.
- Inside a class, files keep the order PESU Academy lists them in.
- A file marked "applicable to whole unit" that shows up under several classes
  is included once, at its first position.
- The PDF opens with the bookmarks panel showing one entry per class
  (with sub-entries when a class has several files).

## Options (click the extension icon)

- **Convert PowerPoint & Word files to PDF**: on by default.
- **Also keep the original PowerPoint / Word files**: off by default.
- **Add a title page before each class**: off by default.

## How it works

Everything runs inside your logged-in PESU Academy tab, using the same requests
the site makes when you click around.

| Step | Request |
| --- | --- |
| Classes in a unit | `GET /Academy/s/studentProfilePESUAdmin?controllerMode=6403&actionType=43&coursecontentid=<unitId>&selectedData=<courseId>&menuId=653` |
| Files of a class | `GET …?controllerMode=6403&actionType=60&id=<type>&unitid=<classId>&selectedData=<courseId>&menuId=653` (type 2 = slides, 3 = notes, read from the class table) |
| File | `GET /Academy/s/referenceMeterials/downloadslidecoursedoc/<docId>` |

The server labels every file `application/pdf`, so the extension checks each
file's first bytes (`%PDF` vs a ZIP/Office header) to decide what it is.

Office files are sent to a hidden extension page (`offscreen/`) that runs
LibreOffice compiled to WebAssembly ([@matbee/libreoffice-converter](https://www.npmjs.com/package/@matbee/libreoffice-converter)
2.7.2, in `lo/`). It's loaded only when a unit contains Office files, and freed
after 3 idle minutes. PDFs are merged with [pdf-lib](https://pdf-lib.js.org/) 1.17.1 (`lib/`).

## Files

```
manifest.json         MV3 manifest
background.js         saves files; opens/closes the converter page
src/pesu.js           PESU Academy requests and HTML parsing
src/convert.js        sends Office files to the converter, gets PDFs back
src/merge.js          PDF merging, placeholder pages, bookmarks
src/content.js        the bar on course pages and the download flow
offscreen/            hidden converter page
lo/                   LibreOffice WebAssembly build (MPL-2.0, see lo/NOTICE.md)
lib/pdf-lib.min.js    PDF library (MIT)
popup/                options popup
tools/                fetch + patch scripts for the LibreOffice build
store/                Web Store listing text and images (not part of the extension)
```

If PESU Academy changes its page layout, the parsing functions in `src/pesu.js`
(`parseUnits`, `parseClasses`, `parseMaterialLinks`) are the place to adjust.

## Updating the LibreOffice build

```
npm pack @matbee/libreoffice-converter@<version>
# copy dist/browser.js, dist/browser.worker.global.js and
# wasm/soffice.{js,wasm,data,worker.js} into lo/, then:
node tools/patch-soffice.mjs lo/soffice.js lo/browser.worker.global.js
```

The patch is needed for two reasons: extension pages forbid `new Function(...)`,
which the build's glue code uses, and in a hidden extension page the build
deadlocks if it has to start threads on demand, so more are started up front.
The script explains both and fails loudly if a newer build no longer matches.

## Licenses

- Extension code: MIT (`LICENSE`), © 2026 Aditya Kalloli
- pdf-lib: MIT (`lib/pdf-lib.LICENSE.md`)
- LibreOffice / @matbee/libreoffice-converter: MPL-2.0 (`lo/NOTICE.md`)
