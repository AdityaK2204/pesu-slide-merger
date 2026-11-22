# Privacy policy — Slide Merger for PESU Academy

_Last updated: 23 November 2026_

Slide Merger for PESU Academy is a browser extension made by Aditya Kalloli.
It is unofficial and not affiliated with or endorsed by PES University.

## What the extension does with your data

**It does not collect, store or send any personal data to the developer or to anyone else.**
There is no server, no analytics, no tracking and no advertising.

- It runs only on `pesuacademy.com` pages.
- When you click its button, it asks PESU Academy for the list of classes in
  the selected unit and downloads the slide or notes files you can already open
  there. These requests go only to `pesuacademy.com` and use the login session
  you already have in your browser. The extension never sees or stores your
  password.
- PowerPoint and Word files are converted to PDF inside your browser by a copy
  of LibreOffice bundled with the extension. The files are never uploaded.
- The merged PDF (and any file that couldn't be merged) is saved to your
  Downloads folder.

## What is stored

Only your choices in the extension's options (convert Office files, keep
originals, title pages, and whether you last picked Slides or Notes). They are
kept with the browser's extension storage (`chrome.storage`), which your
browser may sync to your own browser account if you use browser sync.
Downloaded course files are held in memory only while a download is running.

## Permissions

| Permission | Why |
| --- | --- |
| Access to `pesuacademy.com` | Show the download button on course pages and fetch the unit's class list and files with your session |
| Downloads | Save the merged PDF into `Downloads/PESU Slides/<course>/` |
| Storage | Remember your options |
| Offscreen | Run the bundled PowerPoint/Word-to-PDF converter in a hidden extension page |

## Contact

Questions or problems: open an issue at
https://github.com/AdityaK2204/pesu-slide-merger/issues
