# Change Log

All notable changes to the "update-now" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.2.0] - 2025-05-07

### Added

 - Detection of: peer, dev, optional dependencies
 - Badge to show these different types of dependencies sections

### Fixed
 
 - Bug that prevented the Code Lens to appear in the package.json file


## [1.1.0] - 2025-04-30

### Added

 - Introduced new page for visualizing the stored dependencies
 - NavToPackage is now available to the Latest tab as well
 - Empty state for when the package.json file tab is not focused on
 - Bulk update for the visible code lenses
 - Package name sanitization

### Fixed
 
 - Text colors for the heading sections in Cache View

### Changed
 
 - Improved copy for a simpler user experience
 - Reduced the time allocated to fetch the latest version from 35 to 25 seconds


## [1.0.1] - 2025-01-10

### Fixed
 
 - Status indicator showed negative numbers for the first batch of dependencies

### Changed
 
 - Reduced the time alocated to fetch the latest version from 35 to 25 seconds
 - Updated the URL for the marketplace rating button

## [1.0.0] - 2024-12-30

### Added
 
 - New CodeLens Insights panel to track dependency updates
 - Historic dependency updates are now saved
 - Configurable CodeLens for patch, minor and major updates
 - Code and UX improvements

### Changed
 
 - Caching of dependencies data to reduce registry calls



## [0.0.8] - 2024-11-08

### Added

 - DevDependencies have now CodeLenses too.
 - Latest version is saved locally to reduce the registry calls. 

## [0.0.7] - 2023-12-03

### Fixed

 - Range updates `~` and `^` are preserved when the latest version is a patch or a minor update.

## [0.0.6] - 2023-11-19

### Added

 - New informationMessage when an update is performed

### Changed

- Updated copy in the readme and changelog
- Updated emojis to ❇️ ✴️ 🛑 for patch, minor, major update
- Updated dependencies versions


## [0.0.5] - 2023-11-11

### Added

 - New tooltip when hovering the Code Lens
 - Added author and description information to the tooltip

### Changed

- Updated copy in the readme
- Cleaned code
- Updated emojis to ✅ ⚠️ 🛑 for patch, minor, marjor update

### Removed

- Out of date dependencies count



## [0.0.4] - 2023-11-06

### Added

- Saved file after the dependency is updated.
  
## [0.0.3] - 2023-11-05

### Added

- Preview image in README.md
- Emojis for update type
  
### Changed

- Updated copy in the readme
- Cleaned code
- Updated dependencies to their latest version: axios, semver



## [0.0.2] - 2023-05-25

### Added

- CodeLens for when all dependencies are up to date
  
### Changed

- Updated copy in the readme
- Cleaned code
- Updated dependencies to their latest version: axios, semver


## [0.0.1] - 2023-05-24

- Initial release