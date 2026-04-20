# AGENTS

## Purpose
This repository contains the CherryPucker VS Code extension.

## Project Scope
- Runtime entry: `extension.js`
- Manifest: `package.json`
- User docs: `README.md`

## Working Rules
- Keep command IDs and configuration keys stable unless explicitly requested.
- Preserve backward compatibility for existing settings when possible.
- Prefer small, targeted edits over broad refactors.
- Do not remove existing user-facing commands without confirmation.

## Validation
- Ensure `package.json` remains valid JSON.
- Keep `contributes.commands` and `activationEvents` aligned.
- If dependencies change, update `package-lock.json`.

## Packaging
- Use `npm run package` to build a `.vsix`.
- Keep `files` in `package.json` accurate so published artifacts are minimal.

## Safety
- Never run destructive git commands (`reset --hard`, forced checkout) unless explicitly requested.
- Do not revert user changes outside the task scope.
