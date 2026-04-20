# CherryPucker

CherryPucker is a VS Code extension that copies template-driven text and object property values from the JSON object at your cursor.

## Features

- Copy from 10 configurable templates
- Copy a selected object value directly
- Copy a selected object value with quotes

## Commands

- `CherryPucker: Copy Template 1` ... `CherryPucker: Copy Template 10`
- `CherryPucker: Copy Object Value`
- `CherryPucker: Copy Object Value (Quoted)`

## Configuration

Set template strings in VS Code settings:

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

Use placeholders such as `${title}`, `${value}`, `${name}`, etc., based on fields in the current object.

## Development

```bash
npm install
npm run package
```

## License

MIT