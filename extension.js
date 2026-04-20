const vscode = require('vscode');
const jsonc = require('jsonc-parser');

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

function truncateForNotification(text, max = 140) {
	const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
	return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function notifyClipboard(action, text) {
	vscode.window.showInformationMessage(`CherryPucker: ${action} -> ${truncateForNotification(text)}`);
}

function substituteTemplate(template, data) {
	return template.replace(/\$\{([^}]+)\}/g, (_m, key) => {
		const v = resolvePath(data, key.trim());
		return v === undefined ? '' : formatValue(v);
	});
}

function parseTreeWithNodeAtCursor(editor) {
	const document = editor.document;
	const text = document.getText();
	const root = jsonc.parseTree(text);
	if (!root) return null;
	const offset = document.offsetAt(editor.selection.active);
	let node = jsonc.findNodeAtOffset(root, offset, true);
	return { document, text, root, offset, node };
}

function findObjectAtCursor(editor) {
	const parsed = parseTreeWithNodeAtCursor(editor);
	if (!parsed) return null;
	let node = parsed.node;
	while (node && node.type !== 'object') node = node.parent;
	if (!node) return null;
	return { ...parsed, objectNode: node, objectValue: jsonc.getNodeValue(node) };
}

function offsetToPosition(document, offset) { return document.positionAt(offset); }
function rangeFromOffsets(document, start, end) { return new vscode.Range(document.positionAt(start), document.positionAt(end)); }

function restoreCursor(editor, selection) {
	editor.selection = selection;
	editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function getIndentUnit(editor) {
	const { insertSpaces, tabSize } = editor.options;
	if (!insertSpaces) return '\t';
	return ' '.repeat(typeof tabSize === 'number' ? tabSize : 2);
}

function getLineIndent(document, offset) {
	const line = document.lineAt(document.positionAt(offset).line).text;
	const m = line.match(/^\s*/);
	return m ? m[0] : '';
}

function getObjectProperties(objectNode) {
	if (!objectNode || !Array.isArray(objectNode.children)) return [];
	return objectNode.children
		.filter((n) => n.type === 'property' && n.children && n.children.length >= 2)
		.map((propNode) => {
			const keyNode = propNode.children[0];
			const valueNode = propNode.children[1];
			const key = jsonc.getNodeValue(keyNode);
			return {
				key,
				propNode,
				keyNode,
				valueNode,
				rawValue: jsonc.getNodeValue(valueNode),
				keyRange: [keyNode.offset, keyNode.offset + keyNode.length],
				valueRange: [valueNode.offset, valueNode.offset + valueNode.length],
				nameInsideQuoteRange: [keyNode.offset + 1, keyNode.offset + keyNode.length - 1],
			};
		});
}

function propertyQuickPickItems(properties) {
	return properties.map((p) => ({ label: p.key, description: truncateForNotification(formatValue(p.rawValue), 100), prop: p }));
}

function isSimpleValue(v) {
	return v == null || ['string', 'number', 'boolean'].includes(typeof v);
}

function parseClipboardForValue(clipboard, targetWasString) {
	if (targetWasString) {
		const t = clipboard.trim();
		if (t.startsWith('"') && t.endsWith('"')) return t;
		return JSON.stringify(clipboard);
	}
	return clipboard;
}

function nodeIntersectsSelection(node, selStart, selEnd) {
	const nStart = node.offset;
	const nEnd = node.offset + node.length;
	return nEnd >= selStart && nStart <= selEnd;
}

function selectedArrayObjectNodes(editor, root) {
	if (!root) return [];
	const out = [];
	const sels = editor.selections.filter((s) => !s.isEmpty);
	if (!sels.length) return out;
	const ranges = sels.map((s) => [editor.document.offsetAt(s.start), editor.document.offsetAt(s.end)]);
	const walk = (node) => {
		if (!node) return;
		if (node.type === 'object' && node.parent && node.parent.type === 'array') {
			for (const [a, b] of ranges) {
				if (nodeIntersectsSelection(node, a, b)) {
					out.push(node);
					break;
				}
			}
		}
		if (node.children) node.children.forEach(walk);
	};
	walk(root);
	return out;
}

function uniqueByOffset(nodes) {
	const seen = new Set();
	const out = [];
	for (const n of nodes) {
		const k = `${n.offset}:${n.length}`;
		if (!seen.has(k)) { seen.add(k); out.push(n); }
	}
	return out;
}

function getTargetObjectNodes(editor, parsedAtCursor) {
	const selected = uniqueByOffset(selectedArrayObjectNodes(editor, parsedAtCursor.root));
	if (selected.length) return selected;
	return [parsedAtCursor.objectNode];
}

async function replaceRange(editor, start, end, replacement) {
	return editor.edit((b) => b.replace(rangeFromOffsets(editor.document, start, end), replacement));
}

function asJsonPropertyName(text) { return JSON.stringify(String(text)); }

function propertySnippetWithComma(text, propNode) {
	let start = propNode.offset;
	let end = propNode.offset + propNode.length;
	while (end < text.length && /[ \t]/.test(text[end])) end += 1;
	if (text[end] === ',') end += 1;
	return { start, end, text: text.slice(start, end) };
}

function findPropertyByKey(objectNode, key) {
	return getObjectProperties(objectNode).find((p) => p.key === key) || null;
}

function buildPropertyText(key, rawValueText) {
	return `${JSON.stringify(key)}: ${rawValueText}`;
}

function sortObjectKeys(value, deep) {
	if (Array.isArray(value)) return deep ? value.map((v) => sortObjectKeys(v, true)) : value;
	if (!value || typeof value !== 'object') return value;
	const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
	const out = {};
	for (const k of keys) out[k] = deep ? sortObjectKeys(value[k], true) : value[k];
	return out;
}

function formatWithBaseIndent(baseIndent, indentUnit, value) {
	const json = JSON.stringify(value, null, indentUnit);
	return json.split('\n').map((line, i) => (i === 0 ? line : `${baseIndent}${line}`)).join('\n');
}

async function runTemplateCommand(index) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return vscode.window.showWarningMessage('CherryPucker: No active editor.');
	const found = findObjectAtCursor(editor);
	if (!found) return vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
	const template = vscode.workspace.getConfiguration('cherryPucker').get(`template${index}`, '');
	const result = substituteTemplate(template, found.objectValue);
	await vscode.env.clipboard.writeText(result);
	notifyClipboard(`Copied Template ${index}`, result);
}

function buildPropertyQuickPickItems(obj) {
	return Object.keys(obj).map((key) => {
		const value = obj[key];
		const valueString = formatValue(value);
		return { label: key, description: valueString.length > 80 ? `${valueString.slice(0, 80)}...` : valueString, rawValue: value };
	});
}

async function runCopyValueCommand(options) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return vscode.window.showWarningMessage('CherryPucker: No active editor.');
	const found = findObjectAtCursor(editor);
	if (!found || typeof found.objectValue !== 'object' || Array.isArray(found.objectValue)) return vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
	const items = buildPropertyQuickPickItems(found.objectValue);
	if (!items.length) return vscode.window.showWarningMessage('CherryPucker: Object has no properties to copy.');
	const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a property to copy', matchOnDescription: true });
	if (!picked) return;
	const text = options.quoted ? JSON.stringify(picked.rawValue) : formatValue(picked.rawValue);
	await vscode.env.clipboard.writeText(text);
	notifyClipboard(`Copied ${options.quoted ? 'quoted ' : ''}value for "${picked.label}"`, text);
}

async function pickPropertyFromObjects(editor, objectNodes, placeHolder) {
	const propMap = new Map();
	for (const n of objectNodes) {
		for (const p of getObjectProperties(n)) {
			if (!propMap.has(p.key)) propMap.set(p.key, p.rawValue);
		}
	}
	const items = Array.from(propMap.keys()).sort().map((k) => ({
		label: k,
		description: isSimpleValue(propMap.get(k)) ? truncateForNotification(formatValue(propMap.get(k)), 100) : '(complex value)',
	}));
	if (!items.length) return null;
	const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
	return picked ? picked.label : null;
}

async function runJumpToPropertyNameCommand() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return vscode.window.showWarningMessage('CherryPucker: No active editor.');
	const original = editor.selection;
	const found = findObjectAtCursor(editor);
	if (!found || typeof found.objectValue !== 'object' || Array.isArray(found.objectValue)) return vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
	const props = getObjectProperties(found.objectNode);
	if (!props.length) return vscode.window.showWarningMessage('CherryPucker: Object has no properties.');
	const qp = vscode.window.createQuickPick();
	qp.items = propertyQuickPickItems(props);
	qp.placeholder = 'Select a property name to jump to';
	let accepted = false;
	qp.onDidChangeActive((items) => {
		if (!items.length) return;
		const p = items[0].prop;
		editor.revealRange(rangeFromOffsets(editor.document, p.nameInsideQuoteRange[0], p.nameInsideQuoteRange[1]), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
	});
	qp.onDidAccept(() => {
		const sel = qp.selectedItems[0];
		if (!sel) return;
		const p = sel.prop;
		editor.selection = new vscode.Selection(offsetToPosition(editor.document, p.nameInsideQuoteRange[0]), offsetToPosition(editor.document, p.nameInsideQuoteRange[1]));
		editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		accepted = true;
		qp.hide();
	});
	qp.onDidHide(() => {
		qp.dispose();
		if (!accepted) restoreCursor(editor, original);
	});
	qp.show();
}

async function runPropertyCommand(action) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return vscode.window.showWarningMessage('CherryPucker: No active editor.');
	const parsed = findObjectAtCursor(editor);
	if (!parsed || typeof parsed.objectValue !== 'object' || Array.isArray(parsed.objectValue)) return vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
	const original = editor.selection;
	const targetObjects = getTargetObjectNodes(editor, parsed);
	const propName = await pickPropertyFromObjects(editor, targetObjects, 'Select a property');
	if (!propName) return;
	const clipboard = await vscode.env.clipboard.readText();

	if (action === 'copyPropertyValue') {
		const lines = [];
		for (const o of targetObjects) {
			const p = findPropertyByKey(o, propName);
			if (p) lines.push(formatValue(p.rawValue));
		}
		const text = lines.join('\n');
		await vscode.env.clipboard.writeText(text);
		notifyClipboard(`Copied value for "${propName}"`, text);
		restoreCursor(editor, original);
		return;
	}

	if (action === 'pastePropertyValue' || action === 'pastePropertyValueAndSelect' || action === 'deletePropertyValue') {
		const sels = [];
		await editor.edit((b) => {
			for (const o of targetObjects) {
				const p = findPropertyByKey(o, propName);
				if (p) {
					let rep = '';
					if (action === 'pastePropertyValue' || action === 'pastePropertyValueAndSelect') rep = parseClipboardForValue(clipboard, typeof p.rawValue === 'string');
					if (action === 'deletePropertyValue') rep = typeof p.rawValue === 'string' ? '""' : '';
					b.replace(rangeFromOffsets(editor.document, p.valueRange[0], p.valueRange[1]), rep);
					if (action === 'pastePropertyValueAndSelect') sels.push(new vscode.Selection(offsetToPosition(editor.document, p.valueRange[0]), offsetToPosition(editor.document, p.valueRange[0] + rep.length)));
					if (action === 'deletePropertyValue') sels.push(new vscode.Selection(offsetToPosition(editor.document, p.valueRange[0]), offsetToPosition(editor.document, p.valueRange[0])));
				} else if (action === 'pastePropertyValue' || action === 'pastePropertyValueAndSelect') {
					const ins = o.offset + o.length - 1;
					const hasProps = (o.children || []).length > 0;
					const prefix = hasProps ? ', ' : '';
					const raw = JSON.stringify(clipboard);
					const txt = `${prefix}${buildPropertyText(propName, raw)}`;
					b.insert(offsetToPosition(editor.document, ins), txt);
				}
			}
		});
		if (action === 'pastePropertyValue') restoreCursor(editor, original);
		else if (sels.length) editor.selections = sels;
		vscode.window.showInformationMessage(`CherryPucker: ${action}`);
		return;
	}

	if (action === 'copyPropertyName') {
		await vscode.env.clipboard.writeText(propName);
		notifyClipboard(`Copied property name "${propName}"`, propName);
		restoreCursor(editor, original);
		return;
	}

	if (action === 'pastePropertyName' || action === 'pastePropertyNameAndSelect' || action === 'deletePropertyName') {
		const sels = [];
		await editor.edit((b) => {
			for (const o of targetObjects) {
				const p = findPropertyByKey(o, propName);
				if (!p) continue;
				if (action === 'deletePropertyName') {
					b.replace(rangeFromOffsets(editor.document, p.keyRange[0], p.keyRange[1]), '');
					sels.push(new vscode.Selection(offsetToPosition(editor.document, p.keyRange[0]), offsetToPosition(editor.document, p.keyRange[0])));
				} else {
					const rep = asJsonPropertyName(clipboard);
					b.replace(rangeFromOffsets(editor.document, p.keyRange[0], p.keyRange[1]), rep);
					if (action === 'pastePropertyNameAndSelect') sels.push(new vscode.Selection(offsetToPosition(editor.document, p.valueRange[0]), offsetToPosition(editor.document, p.valueRange[1])));
				}
			}
		});
		if (action === 'pastePropertyName') restoreCursor(editor, original);
		else if (sels.length) editor.selections = sels;
		vscode.window.showInformationMessage(`CherryPucker: ${action}`);
		return;
	}

	if (action === 'copyProperty') {
		const lines = [];
		for (const o of targetObjects) {
			const p = findPropertyByKey(o, propName);
			if (!p) continue;
			const snap = propertySnippetWithComma(parsed.text, p.propNode);
			lines.push(snap.text);
		}
		const out = lines.join('\n');
		await vscode.env.clipboard.writeText(out);
		notifyClipboard(`Copied property "${propName}"`, out);
		restoreCursor(editor, original);
		return;
	}

	if (action === 'dupeProperty' || action === 'movePropertyUp' || action === 'movePropertyDown' || action === 'deleteProperty') {
		await editor.edit((b) => {
			for (const o of targetObjects) {
				const props = getObjectProperties(o);
				const idx = props.findIndex((p) => p.key === propName);
				if (idx < 0) continue;
				const p = props[idx];
				const snap = propertySnippetWithComma(parsed.text, p.propNode);
				if (action === 'deleteProperty') {
					b.replace(rangeFromOffsets(editor.document, snap.start, snap.end), '');
					continue;
				}
				if (action === 'dupeProperty') {
					b.insert(offsetToPosition(editor.document, snap.end), snap.text);
					continue;
				}
				const swapIdx = action === 'movePropertyUp' ? idx - 1 : idx + 1;
				if (swapIdx < 0 || swapIdx >= props.length) continue;
				const p2 = props[swapIdx];
				const a = propertySnippetWithComma(parsed.text, p.propNode);
				const c = propertySnippetWithComma(parsed.text, p2.propNode);
				const left = a.start < c.start ? a : c;
				const right = a.start < c.start ? c : a;
				const combined = parsed.text.slice(left.start, right.end);
				const first = parsed.text.slice(a.start, a.end);
				const second = parsed.text.slice(c.start, c.end);
				const swapped = a.start < c.start ? combined.replace(first + second, second + first) : combined.replace(second + first, first + second);
				b.replace(rangeFromOffsets(editor.document, left.start, right.end), swapped);
			}
		});
		vscode.window.showInformationMessage(`CherryPucker: ${action}`);
		if (action === 'dupeProperty') {
			const reparsed = findObjectAtCursor(editor);
			if (reparsed) {
				const p = findPropertyByKey(reparsed.objectNode, propName);
				if (p) editor.selection = new vscode.Selection(offsetToPosition(editor.document, p.nameInsideQuoteRange[0]), offsetToPosition(editor.document, p.nameInsideQuoteRange[1]));
			}
		}
		return;
	}
}

function findArrayAtCursor(editor) {
	const parsed = parseTreeWithNodeAtCursor(editor);
	if (!parsed) return null;
	let node = parsed.node;
	while (node && node.type !== 'array') node = node.parent;
	if (!node) return null;
	return { ...parsed, arrayNode: node, arrayValue: jsonc.getNodeValue(node) };
}

function getSelectedArrayIndices(editor, arrayNode) {
	const sels = editor.selections.filter((s) => !s.isEmpty);
	if (!sels.length) return null;
	const ranges = sels.map((s) => [editor.document.offsetAt(s.start), editor.document.offsetAt(s.end)]);
	const out = [];
	(arrayNode.children || []).forEach((child, idx) => {
		for (const [a, b] of ranges) {
			if (nodeIntersectsSelection(child, a, b)) { out.push(idx); break; }
		}
	});
	return out.length ? out : null;
}

async function pickPropertyValueFromObjects(objects) {
	const map = new Map();
	for (const obj of objects) {
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
		for (const [k, v] of Object.entries(obj)) {
			if (!isSimpleValue(v)) continue;
			const key = `${k}:::${String(v)}`;
			if (!map.has(key)) map.set(key, { k, v });
		}
	}
	const items = Array.from(map.values()).map((x) => ({ label: x.k, description: String(x.v), detail: `${x.k} = ${String(x.v)}`, k: x.k, v: x.v }));
	if (!items.length) return null;
	const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select property/value' });
	if (!picked) return null;
	return { key: picked.k, value: picked.v };
}

async function runArrayCommand(action) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return vscode.window.showWarningMessage('CherryPucker: No active editor.');
	const found = findArrayAtCursor(editor);
	if (!found || !Array.isArray(found.arrayValue)) return vscode.window.showWarningMessage('CherryPucker: Place the cursor inside an array.');
	const selected = getSelectedArrayIndices(editor, found.arrayNode);
	const idxs = selected || found.arrayValue.map((_, i) => i);
	const objects = idxs.map((i) => found.arrayValue[i]).filter((v) => v && typeof v === 'object' && !Array.isArray(v));
	if (!objects.length) return vscode.window.showWarningMessage('CherryPucker: No object items in target array range.');
	const picked = await pickPropertyValueFromObjects(objects);
	if (!picked) return;
	const { key, value } = picked;
	const matches = idxs.filter((i) => {
		const o = found.arrayValue[i];
		return o && typeof o === 'object' && !Array.isArray(o) && String(o[key]) === String(value);
	});
	if (!matches.length) return vscode.window.showInformationMessage('CherryPucker: No matching objects found.');

	if (action === 'copyObjectsFromArrayByPropertyValue') {
		const text = matches.map((i) => JSON.stringify(found.arrayValue[i])).join('\n');
		await vscode.env.clipboard.writeText(text);
		notifyClipboard('Copied matching objects', text);
		return;
	}

	let next = [...found.arrayValue];
	if (action === 'deleteObjectsFromArrayByPropertyValue' || action === 'cutObjectsFromArrayByPropertyValue') {
		if (action === 'cutObjectsFromArrayByPropertyValue') {
			const text = matches.map((i) => JSON.stringify(found.arrayValue[i])).join('\n');
			await vscode.env.clipboard.writeText(text);
			notifyClipboard('Cut matching objects', text);
		}
		next = next.filter((_, i) => !matches.includes(i));
	}
	if (action === 'setObjectsArrayPropertyValue') {
		const clip = await vscode.env.clipboard.readText();
		let parsedClip;
		try { parsedClip = JSON.parse(clip); } catch { parsedClip = clip; }
		for (const i of matches) {
			next[i] = { ...next[i], [key]: parsedClip };
		}
	}
	if (action === 'sortObjectArrayByPropertyValueAscending' || action === 'sortObjectArrayByPropertyValueDescending') {
		const dir = action.endsWith('Descending') ? -1 : 1;
		const targetSet = new Set(idxs);
		const segment = idxs.map((i) => next[i]);
		segment.sort((a, b) => String(a?.[key] ?? '').localeCompare(String(b?.[key] ?? '')) * dir);
		let p = 0;
		next = next.map((item, i) => (targetSet.has(i) ? segment[p++] : item));
	}

	const baseIndent = getLineIndent(editor.document, found.arrayNode.offset);
	const indentUnit = getIndentUnit(editor);
	const replacement = formatWithBaseIndent(baseIndent, indentUnit, next);
	await replaceRange(editor, found.arrayNode.offset, found.arrayNode.offset + found.arrayNode.length, replacement);
	vscode.window.showInformationMessage(`CherryPucker: ${action}`);
}

async function runShowPickerForAllCommands() {
	const items = [
		'cherryPucker.copyPropertyValue', 'cherryPucker.pastePropertyValue', 'cherryPucker.pastePropertyValueAndSelect', 'cherryPucker.deletePropertyValue',
		'cherryPucker.jumpToPropertyName', 'cherryPucker.copyPropertyName', 'cherryPucker.pastePropertyName', 'cherryPucker.pastePropertyNameAndSelect',
		'cherryPucker.deletePropertyName', 'cherryPucker.copyProperty', 'cherryPucker.dupeProperty', 'cherryPucker.movePropertyUp', 'cherryPucker.movePropertyDown',
		'cherryPucker.deleteProperty', 'cherryPucker.copyObject', 'cherryPucker.dupeObject', 'cherryPucker.sortObjectProperties', 'cherryPucker.sortObjectPropertiesDeep',
		'cherryPucker.sortObjectArrayByPropertyValueAscending', 'cherryPucker.sortObjectArrayByPropertyValueDescending',
		'cherryPucker.deleteObjectsFromArrayByPropertyValue', 'cherryPucker.copyObjectsFromArrayByPropertyValue', 'cherryPucker.cutObjectsFromArrayByPropertyValue',
		'cherryPucker.setObjectsArrayPropertyValue'
	].map((c) => ({ label: c.replace('cherryPucker.', ''), command: c }));
	const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Run CherryPucker command' });
	if (!picked) return;
	await vscode.commands.executeCommand(picked.command);
}

async function runObjectCommand(action) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return vscode.window.showWarningMessage('CherryPucker: No active editor.');
	const original = editor.selection;
	const found = findObjectAtCursor(editor);
	if (!found) return vscode.window.showWarningMessage('CherryPucker: Place the cursor inside a JSON object.');
	const objectStart = found.objectNode.offset;
	const objectEnd = found.objectNode.offset + found.objectNode.length;
	const objectText = editor.document.getText(rangeFromOffsets(editor.document, objectStart, objectEnd));

	if (action === 'copyObject') {
		await vscode.env.clipboard.writeText(objectText);
		notifyClipboard('Copied object', objectText);
		restoreCursor(editor, original);
		return;
	}
	if (action === 'dupeObject') {
		await vscode.env.clipboard.writeText(objectText);
		await editor.edit((b) => b.insert(offsetToPosition(editor.document, objectEnd), objectText));
		const p = offsetToPosition(editor.document, objectEnd);
		editor.selection = new vscode.Selection(p, p);
		notifyClipboard('Duplicated object', objectText);
		return;
	}
	if (action === 'sortObjectProperties' || action === 'sortObjectPropertiesDeep') {
		const deep = action === 'sortObjectPropertiesDeep';
		const sorted = sortObjectKeys(found.objectValue, deep);
		const replacement = formatWithBaseIndent(getLineIndent(editor.document, objectStart), getIndentUnit(editor), sorted);
		await replaceRange(editor, objectStart, objectEnd, replacement);
		vscode.window.showInformationMessage(`CherryPucker: Sorted object properties${deep ? ' (deep)' : ''}`);
	}
}

function activate(context) {
	for (let i = 1; i <= 10; i += 1) context.subscriptions.push(vscode.commands.registerCommand(`cherryPucker.copyTemplate${i}`, () => runTemplateCommand(i)));
	const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
	reg('cherryPucker.copyObjectValue', () => runCopyValueCommand({ quoted: false }));
	reg('cherryPucker.copyObjectValueQuoted', () => runCopyValueCommand({ quoted: true }));
	reg('cherryPucker.copyPropertyValue', () => runPropertyCommand('copyPropertyValue'));
	reg('cherryPucker.pastePropertyValue', () => runPropertyCommand('pastePropertyValue'));
	reg('cherryPucker.pastePropertyValueAndSelect', () => runPropertyCommand('pastePropertyValueAndSelect'));
	reg('cherryPucker.deletePropertyValue', () => runPropertyCommand('deletePropertyValue'));
	reg('cherryPucker.jumpToPropertyName', () => runJumpToPropertyNameCommand());
	reg('cherryPucker.copyPropertyName', () => runPropertyCommand('copyPropertyName'));
	reg('cherryPucker.pastePropertyName', () => runPropertyCommand('pastePropertyName'));
	reg('cherryPucker.pastePropertyNameAndSelect', () => runPropertyCommand('pastePropertyNameAndSelect'));
	reg('cherryPucker.deletePropertyName', () => runPropertyCommand('deletePropertyName'));
	reg('cherryPucker.copyProperty', () => runPropertyCommand('copyProperty'));
	reg('cherryPucker.dupeProperty', () => runPropertyCommand('dupeProperty'));
	reg('cherryPucker.movePropertyUp', () => runPropertyCommand('movePropertyUp'));
	reg('cherryPucker.movePropertyDown', () => runPropertyCommand('movePropertyDown'));
	reg('cherryPucker.deleteProperty', () => runPropertyCommand('deleteProperty'));
	reg('cherryPucker.copyObject', () => runObjectCommand('copyObject'));
	reg('cherryPucker.dupeObject', () => runObjectCommand('dupeObject'));
	reg('cherryPucker.sortObjectProperties', () => runObjectCommand('sortObjectProperties'));
	reg('cherryPucker.sortObjectPropertiesDeep', () => runObjectCommand('sortObjectPropertiesDeep'));
	reg('cherryPucker.sortObjectArrayByPropertyValueAscending', () => runArrayCommand('sortObjectArrayByPropertyValueAscending'));
	reg('cherryPucker.sortObjectArrayByPropertyValueDescending', () => runArrayCommand('sortObjectArrayByPropertyValueDescending'));
	reg('cherryPucker.deleteObjectsFromArrayByPropertyValue', () => runArrayCommand('deleteObjectsFromArrayByPropertyValue'));
	reg('cherryPucker.copyObjectsFromArrayByPropertyValue', () => runArrayCommand('copyObjectsFromArrayByPropertyValue'));
	reg('cherryPucker.cutObjectsFromArrayByPropertyValue', () => runArrayCommand('cutObjectsFromArrayByPropertyValue'));
	reg('cherryPucker.setObjectsArrayPropertyValue', () => runArrayCommand('setObjectsArrayPropertyValue'));
	reg('cherryPucker.showPickerForAllCommands', () => runShowPickerForAllCommands());
}

function deactivate() {}

module.exports = { activate, deactivate };