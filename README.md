# CherryPucker

CherryPucker is a VS Code extension for copying JSON data quickly using configurable text templates.

It can:
- Copy from one of 10 reusable templates.
- Copy a selected object value directly.
- Copy a selected object value wrapped in quotes.

## Installation

Install from the VS Code Marketplace, or install a local `.vsix` package:

```bash
code --install-extension cherrypucker-0.0.1.vsix
```

## Commands

Open the Command Palette and run:

- `CherryPucker: Copy Template 1`
- `CherryPucker: Copy Template 2`
- `CherryPucker: Copy Template 3`
- `CherryPucker: Copy Template 4`
- `CherryPucker: Copy Template 5`
- `CherryPucker: Copy Template 6`
- `CherryPucker: Copy Template 7`
- `CherryPucker: Copy Template 8`
- `CherryPucker: Copy Template 9`
- `CherryPucker: Copy Template 10`
- `CherryPucker: Copy Object Value`
- `CherryPucker: Copy Object Value (Quoted)`

## Configuration

Set template values in `Settings` with these keys:

- `cherryPucker.template1`
- `cherryPucker.template2`
- `cherryPucker.template3`
- `cherryPucker.template4`
- `cherryPucker.template5`
- `cherryPucker.template6`
- `cherryPucker.template7`
- `cherryPucker.template8`
- `cherryPucker.template9`
- `cherryPucker.template10`

Example template:

```json
"cherryPucker.template1": "Title: ${title}\nValue: ${value}"
```

Placeholders are resolved from properties found in the JSON object at your cursor.

## Development

```bash
npm install
npm run package
```

The package command generates a `.vsix` using `vsce`.

## Publishing

1. Bump `version` in `package.json`.
2. Run `npm run package`.
3. Publish with your extension publisher credentials.

## License

MIT
