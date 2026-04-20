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
- `CherryPucker: Apply Suggested Keybindings`
- `CherryPucker: Remove Suggested Keybindings`

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

## Suggested Keybindings

`cherryPucker.copyObject`, `alt+insert o`
`cherryPucker.copyObjectsFromArrayByPropertyValue`, `alt+insert ctrl+v`
`cherryPucker.copyObjectValue`, `insert v`
`cherryPucker.copyObjectValueQuoted`, `insert shift+v`
`cherryPucker.copyProperty`, `alt+insert alt+p`
`cherryPucker.copyPropertyName`, `alt+insert alt+n`
`cherryPucker.copyPropertyValue`, `alt+insert alt+v`
`cherryPucker.copyTemplate1`, `alt+insert shift+1`
`cherryPucker.copyTemplate10`, `alt+insert shift+0`
`cherryPucker.copyTemplate2`, `alt+insert shift+2`
`cherryPucker.copyTemplate3`, `alt+insert shift+3`
`cherryPucker.copyTemplate4`, `alt+insert shift+4`
`cherryPucker.copyTemplate5`, `alt+insert shift+5`
`cherryPucker.copyTemplate6`, `alt+insert shift+6`
`cherryPucker.copyTemplate7`, `alt+insert shift+7`
`cherryPucker.copyTemplate8`, `alt+insert shift+8`
`cherryPucker.copyTemplate9`, `alt+insert shift+9`
`cherryPucker.cutObjectsFromArrayByPropertyValue`, `alt+delete ctrl+x`
`cherryPucker.deleteObjectsFromArrayByPropertyValue`, `alt+delete ctrl+v`
`cherryPucker.deleteProperty`, `alt+delete p`
`cherryPucker.deletePropertyName`, `alt+delete n`
`cherryPucker.deletePropertyValue`, `alt+delete v`
`cherryPucker.dupeObject`, `alt+insert ctrl+d`
`cherryPucker.dupeProperty`, `alt+insert P`
`cherryPucker.jumpToPropertyName`, `insert n`
`cherryPucker.movePropertyDown`, `ctrl+alt+shift+down`
`cherryPucker.movePropertyUp`, `ctrl+alt+shift+up`
`cherryPucker.pastePropertyName`, `alt+insert n`
`cherryPucker.pastePropertyNameAndSelect`, `alt+insert shift+n`
`cherryPucker.pastePropertyValue`, `alt+insert v`
`cherryPucker.pastePropertyValueAndSelect`, `alt+insert shift+v`
`cherryPucker.setObjectsArrayPropertyValue`, `alt+insert ctrl+alt+v`
`cherryPucker.showPickerForAllCommands`, `alt+\` f12`
`cherryPucker.sortObjectArrayByPropertyValueAscending`, `alt+insert ctrl+alt+v`
`cherryPucker.sortObjectArrayByPropertyValueDescending`, `alt+insert ctrl+alt+shift+v`
`cherryPucker.sortObjectProperties`, `alt+insert ctrl+p`
`cherryPucker.sortObjectPropertiesDeep`, `alt+insert ctrl+shift+p`

## Publishing

1. Bump `version` in `package.json`.
2. Run `npm run package`.
3. Publish with your extension publisher credentials.

## License

MIT
