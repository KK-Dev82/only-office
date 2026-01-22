# Plugin Core Management

## Overview

Each plugin now has its own independent core files to prevent development conflicts. This allows plugins to be developed and modified independently without affecting each other.

**Note:** We no longer use a shared `shared-core/` folder. Every plugin owns and maintains its own `core/` directory.

## Structure

```text
onlyoffice-plugins/
├── speech-to-text/
│   └── core/             # Independent copy of core files
├── document-office/
│   └── core/             # Independent copy of core files
├── dictionary-abbreviation/
│   └── core/             # Independent copy of core files
└── CORE_MANAGEMENT.md    # This file
```

## Plugins with Independent Cores

1. **speech-to-text** - Speech recognition plugin
2. **document-office** - Clipboard and macros plugin
3. **dictionary-abbreviation** - Dictionary and abbreviation management plugin

## Development Workflow

### When modifying core files

1. **For specific plugin**: Edit files in `plugin-name/core/` directly

### Adding new core files

1. Add the file to the target plugin's `core/`
2. Update that plugin's `index.html` to include the new script if needed

### Plugin-specific modifications

If a plugin needs plugin-specific core modifications:

- Edit `plugin-name/core/` directly
- Document the changes in the plugin's README

## Benefits

- **Independent Development**: Each plugin can be modified without affecting others
- **Version Control**: Changes are isolated and can be tracked per plugin
- **Flexibility**: Plugins can have custom core modifications if needed

## Migration Notes

- All plugins now reference their own `core/` directory instead of `../document-office/core/`
