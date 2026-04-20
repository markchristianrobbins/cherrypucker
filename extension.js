const vscode = require('vscode');
const jsonc = require('jsonc-parser');

/**
 * Resolve a dotted/bracket path against an object.
 * Example: "user.name" or "items[0].id".
 */
function resolvePath(obj, path) {
	if (obj == null) return undefined;
	const normalized = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
	return normalized.split('.').reduce((curr, key) => (curr == null ? undefined : curr[key]), obj);
}

function formatValue(value) {
	if (value === undefined || value === null) return '';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

function substituteTemplate(template, data) {
	return template.replace(/\$\{([^}]+)\}/g, (_match, key) => {
		const value = resolvePath(data, key.trim());
		return value === undefined ? '' : formatValue(value);
	});
}

function findObjectAtCursor(editor) {
	const document = editor.document;
	const offset = document.offsetAt(editor.selection.active);
	const text = document.getText();
	const root = jsonc.parseTree(text);
	if (!root) return null;
	let node = jsonc.findNodeAtOffset(root, offset, true);
	while (node && node.type !== 'object') {
		node = node.parent;
	}
	if (!node || node.type !== 'object') return null;
	const objectValue = jsonc.getNodeValue(node);
	return { objectValue };
}

async function runTemplateCommand(index) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('CherryPucker: No active editor.');
		return;
	}

	const found = findObjectAtCursor(editor);
	if (!found) {
		vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
		return;
	}

	const config = vscode.workspace.getConfiguration('cherryPucker');
	const template = config.get(`template${index}`, '');
	const result = substituteTemplate(template, found.objectValue);
	await vscode.env.clipboard.writeText(result);
	vscode.window.showInformationMessage(`CherryPucker: Copied Template ${index}`, { detail: result, modal: false });
}

function buildPropertyQuickPickItems(obj) {
	return Object.keys(obj).map((key) => {
		const value = obj[key];
		const valueString = formatValue(value);
		return {
			label: key,
			description: valueString.length > 50 ? `${valueString.slice(0, 50)}…` : valueString,
			valueString,
			rawValue: value,
		};
	});
}

async function runCopyValueCommand(options) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('CherryPucker: No active editor.');
		return;
	}

	const found = findObjectAtCursor(editor);
	if (!found || typeof found.objectValue !== 'object' || Array.isArray(found.objectValue)) {
		vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
		return;
	}

	const items = buildPropertyQuickPickItems(found.objectValue);
	if (!items.length) {
		vscode.window.showWarningMessage('CherryPucker: Object has no properties to copy.');
		return;
	}

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select a property to copy',
		matchOnDescription: true,
	});

	if (!picked) return;

	const text = options.quoted ? JSON.stringify(picked.rawValue) : formatValue(picked.rawValue);
	await vscode.env.clipboard.writeText(text);
	vscode.window.showInformationMessage(`CherryPucker: Copied ${options.quoted ? 'quoted ' : ''}value for "${picked.label}"`);
}

function activate(context) {
	// Template commands
	for (let i = 1; i <= 10; i += 1) {
		const disposable = vscode.commands.registerCommand(`cherryPucker.copyTemplate${i}`, () => runTemplateCommand(i));
		context.subscriptions.push(disposable);
	}

	// Object value commands
	context.subscriptions.push(
		vscode.commands.registerCommand('cherryPucker.copyObjectValue', () => runCopyValueCommand({ quoted: false })),
		vscode.commands.registerCommand('cherryPucker.copyObjectValueQuoted', () => runCopyValueCommand({ quoted: true }))
	);
}

function deactivate() { }

module.exports = {
	activate,
	deactivate,
};
