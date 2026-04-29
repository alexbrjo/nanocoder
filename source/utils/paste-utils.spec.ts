import type {PastePlaceholderContent, PlaceholderContent} from '@/types/hooks';
import {PlaceholderType} from '@/types/hooks';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import test from 'ava';
import {handlePaste} from './paste-utils';
import {clearAppConfig, reloadAppConfig} from '../config';

// Tests for handlePaste utility function
// Validates paste handling logic and placeholder creation

console.log(`\npaste-utils.spec.ts`);

const testDir = join(tmpdir(), `nanocoder-paste-test-${Date.now()}`);

test.before(() => {
	mkdirSync(testDir, {recursive: true});
});

test.after.always(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, {recursive: true, force: true});
	}
});

test.afterEach(() => {
	// Clear config cache after each test to avoid cross-test contamination
	clearAppConfig();
});

test('handlePaste returns null for empty pastes', t => {
	const pastedText = '';
	const currentDisplayValue = 'existing content';
	const currentPlaceholderContent: Record<string, PlaceholderContent> = {};

	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		currentPlaceholderContent,
	);

	t.is(result, null);
});

test('handlePaste returns null for small pastes (no placeholder)', t => {
	const pastedText = 'small text';
	const currentDisplayValue = 'existing content';
	const currentPlaceholderContent: Record<string, PlaceholderContent> = {};

	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		currentPlaceholderContent,
	);

	// With default threshold (800), small pastes should return null (no placeholder)
	t.is(result, null);
});

test('handlePaste creates placeholder for large pastes', t => {
	const pastedText = 'a'.repeat(801);
	const currentDisplayValue = 'existing content';
	const currentPlaceholderContent: Record<string, PlaceholderContent> = {};

	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		currentPlaceholderContent,
	);

	t.truthy(result);
	t.is(typeof result!.displayValue, 'string');
	t.true(result!.displayValue.includes('[Paste #'));
	t.true(result!.displayValue.includes('801 chars]'));

	const pasteIds = Object.keys(result!.placeholderContent);
	t.is(pasteIds.length, 1);
	const pasteContent = result!.placeholderContent[
		pasteIds[0]
	] as PastePlaceholderContent;
	t.is(pasteContent.content, pastedText);
	t.is(pasteContent.type, PlaceholderType.PASTE);
});

test('handlePaste inserts placeholder at pasteStartOffset (middle)', t => {
	const pastedText = 'x'.repeat(801);
	const currentDisplayValue = 'before after';
	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		{},
		undefined,
		7,
	);

	t.truthy(result);
	t.is(result!.displayValue, `before [Paste #1: 801 chars]after`);
});

test('handlePaste inserts placeholder at offset 0', t => {
	const pastedText = 'x'.repeat(801);
	const result = handlePaste(pastedText, 'tail text', {}, undefined, 0);

	t.truthy(result);
	t.is(result!.displayValue, `[Paste #1: 801 chars]tail text`);
});

test('handlePaste appends when offset equals length', t => {
	const pastedText = 'x'.repeat(801);
	const currentDisplayValue = 'head text';
	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		{},
		undefined,
		currentDisplayValue.length,
	);

	t.truthy(result);
	t.is(result!.displayValue, `head text[Paste #1: 801 chars]`);
});

test('handlePaste falls back to appending when offset omitted', t => {
	const pastedText = 'x'.repeat(801);
	const result = handlePaste(pastedText, 'head', {});

	t.truthy(result);
	t.is(result!.displayValue, `head[Paste #1: 801 chars]`);
});

test('handlePaste splices at offset even when pastedText is not present in currentDisplayValue', t => {
	const pastedText = 'multi\nline\npaste\n'.repeat(60);
	const currentDisplayValue = 'hello world';
	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		{},
		'multiline',
		6,
	);

	t.truthy(result);
	t.regex(result!.displayValue, /^hello \[Paste #1: \d+ chars\]world$/);
});

test('handlePaste records detectionMethod on placeholder content', t => {
	const pastedText = 'x'.repeat(801);
	const result = handlePaste(pastedText, '', {}, 'multiline', 0);

	t.truthy(result);
	const id = Object.keys(result!.placeholderContent)[0];
	const content = result!.placeholderContent[id] as PastePlaceholderContent;
	t.is(content.detectionMethod, 'multiline');
});

test('handlePaste preserves existing pasted content', t => {
	const existingPlaceholderContent: Record<string, PlaceholderContent> = {
		'123': {
			type: PlaceholderType.PASTE,
			displayText: '[Paste #123: 24 chars]',
			content: 'previous paste content',
			originalSize: 24,
		} as PastePlaceholderContent,
	};
	const pastedText = 'b'.repeat(801);
	const currentDisplayValue = 'some text';

	const result = handlePaste(
		pastedText,
		currentDisplayValue,
		existingPlaceholderContent,
	);

	t.truthy(result);
	t.is(Object.keys(result!.placeholderContent).length, 2);
	const existingContent = result!.placeholderContent[
		'123'
	] as PastePlaceholderContent;
	t.is(existingContent.content, 'previous paste content');

	// Find the new paste ID
	const newPasteId = Object.keys(result!.placeholderContent).find(
		id => id !== '123',
	);
	t.truthy(newPasteId);
	const newContent = result!.placeholderContent[
		newPasteId!
	] as PastePlaceholderContent;
	t.is(newContent.content, pastedText);
});

test('handlePaste respects custom threshold - high threshold prevents placeholder', t => {
	// Create a config with high threshold (1000)
	const configPath = join(testDir, 'nanocoder-preferences.json');
	writeFileSync(
		configPath,
		JSON.stringify({
			nanocoder: {
				paste: {
					singleLineThreshold: 1000,
				},
			},
		}),
		'utf-8',
	);

	// Change to test directory to pick up the config
	const originalCwd = process.cwd();
	try {
		process.chdir(testDir);
		clearAppConfig();
		reloadAppConfig();

		// 100-char paste with 1000 threshold should return null (no placeholder)
		const pastedText = 'x'.repeat(100);
		const currentDisplayValue = 'existing content';
		const currentPlaceholderContent: Record<string, PlaceholderContent> = {};

		const result = handlePaste(
			pastedText,
			currentDisplayValue,
			currentPlaceholderContent,
		);

		t.is(result, null);
	} finally {
		process.chdir(originalCwd);
		clearAppConfig();
	}
});

test('handlePaste respects custom threshold - low threshold creates placeholder', t => {
	// Create a config with low threshold (50)
	const configPath = join(testDir, 'nanocoder-preferences.json');
	writeFileSync(
		configPath,
		JSON.stringify({
			nanocoder: {
				paste: {
					singleLineThreshold: 50,
				},
			},
		}),
		'utf-8',
	);

	// Change to test directory to pick up the config
	const originalCwd = process.cwd();
	try {
		process.chdir(testDir);
		clearAppConfig();
		reloadAppConfig();

		// 100-char paste with 50 threshold SHOULD create placeholder
		const pastedText = 'x'.repeat(100);
		const currentDisplayValue = 'existing content';
		const currentPlaceholderContent: Record<string, PlaceholderContent> = {};

		const result = handlePaste(
			pastedText,
			currentDisplayValue,
			currentPlaceholderContent,
		);

		t.truthy(result);
		t.true(result!.displayValue.includes('[Paste #'));
		t.true(result!.displayValue.includes('100 chars]'));
		t.is(Object.keys(result!.placeholderContent).length, 1);
	} finally {
		process.chdir(originalCwd);
		clearAppConfig();
	}
});
