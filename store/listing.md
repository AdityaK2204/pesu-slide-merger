# Store listing — Slide Merger for PESU Academy

Copy these into the Chrome Web Store dashboard (the Edge Add-ons form asks for the same things).

## Package
- Upload: `slide-merger-for-pesu-academy-2.0.0.zip` (from the GitHub release)

## Store listing tab
- **Name** (from the manifest): Slide Merger for PESU Academy
- **Summary** (from the manifest, 127/132 chars): Download a PESU Academy unit's slides or notes in one click: PowerPoint and Word converted, merged in class order into one PDF.
- **Category**: Education
- **Language**: English
- **Store icon**: `store-icon-128.png`
- **Screenshots** (1280×800): `screenshot-1-one-click.png`, `screenshot-2-bookmarks.png`, `screenshot-3-conversion.png`
- **Small promo tile** (440×280): `promo-small-440x280.png`
- **Marquee promo tile** (1400×560, optional): `promo-marquee-1400x560.png`
- **Official / homepage URL**: https://github.com/AdityaK2204/pesu-slide-merger
- **Support URL**: https://github.com/AdityaK2204/pesu-slide-merger/issues

### Description

```
Stop clicking through every class to download slides one at a time.

On any PESU Academy course page, pick a unit, choose Slides or Notes, and click once. Slide Merger downloads every file in that unit, converts PowerPoint and Word files to PDF, and merges everything, in the same order as the class list, into a single PDF with a bookmark for each class.

FEATURES
• One click per unit, or "All units" for one PDF per unit
• Works for Slides and for Notes
• Right order: classes in the order PESU Academy lists them, files inside a class in their listed order, and "whole unit" files included once
• A bookmark for every class (with sub-bookmarks when a class has several files)
• PowerPoint (.pptx, .ppt) and Word (.docx, .doc) files converted to PDF by a LibreOffice engine that runs inside the extension. Nothing is uploaded.
• Files that can't go into a PDF (like .zip) get a placeholder page and are saved next to it, so nothing goes missing
• Saved to Downloads › PESU Slides › your course

HOW TO USE
1. Log in to PESU Academy and open My Courses, then a course.
2. Pick a unit tab.
3. Choose Slides or Notes and click "Download Unit N slides" (or notes).

PRIVACY
The extension has no server and collects no data. It only runs on pesuacademy.com, uses your existing login to fetch files you can already open, converts and merges them on your own computer, and saves the result to your Downloads folder.
Privacy policy: https://github.com/AdityaK2204/pesu-slide-merger/blob/main/PRIVACY.md

GOOD TO KNOW
• The first PowerPoint/Word conversion after starting the browser takes a few seconds while the converter loads.
• PESU Academy serves files slowly, so a large unit can take a minute or two.
• The extension is about 240 MB because it includes LibreOffice.

Unofficial: not affiliated with or endorsed by PES University.
Made by Aditya Kalloli. Open source: https://github.com/AdityaK2204/pesu-slide-merger
```

## Privacy practices tab
- **Single purpose**: Downloads the slides or notes of a PESU Academy unit and merges them, in class order, into one PDF.
- **Permission justifications**
  - `downloads`: Saves the merged PDF, and any file that can't be merged, into the user's Downloads folder (Downloads/PESU Slides/<course>).
  - `storage`: Remembers the user's options (convert Office files, keep originals, title pages) and whether Slides or Notes was last chosen.
  - `offscreen`: Runs the bundled LibreOffice WebAssembly converter in a hidden extension page to turn PowerPoint and Word files into PDF. It needs a page with Web Workers and SharedArrayBuffer, which a service worker can't provide.
  - Host permission `https://www.pesuacademy.com/*` (and `https://pesuacademy.com/*`): The content script adds the download button to PESU Academy course pages and fetches that unit's class list and files with the user's existing session. No other site is accessed.
- **Remote code**: No, I am not using remote code. All code, including the WebAssembly converter, is in the package.
- **Data usage**: tick none of the data types. Nothing is collected or transmitted.
- **Certifications**: tick the three boxes yourself (data not sold, not used for unrelated purposes, not used for creditworthiness).
- **Privacy policy URL**: https://github.com/AdityaK2204/pesu-slide-merger/blob/main/PRIVACY.md

## Distribution tab
- Visibility: Public
- Regions: All regions
- Payment: Free

## Account tab (shown publicly as the publisher)
- Publisher display name: **Aditya Kalloli**
