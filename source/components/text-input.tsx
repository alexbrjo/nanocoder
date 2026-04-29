import chalk from 'chalk';
import {Text, useInput} from 'ink';
import {useEffect, useState} from 'react';
import {wrapWithTrimmedContinuations} from '@/utils/text-wrapping';

export type Props = {
	readonly placeholder?: string;
	readonly focus?: boolean;
	readonly mask?: string;
	readonly showCursor?: boolean;
	readonly highlightPastedText?: boolean;
	readonly value: string;
	readonly cursorOffset?: number;
	readonly onChange: (value: string, cursorOffset: number) => void;
	readonly onSubmit?: (value: string) => void;
	readonly wrapWidth?: number;
};

function TextInput({
	value: originalValue,
	cursorOffset: cursorOffsetProp,
	placeholder = '',
	focus = true,
	mask,
	highlightPastedText = false,
	showCursor = true,
	onChange,
	onSubmit,
	wrapWidth,
}: Props) {
	const [internalCursorOffset, setInternalCursorOffset] = useState(
		(originalValue || '').length,
	);
	const [cursorWidth, setCursorWidth] = useState(0);

	const isControlled = cursorOffsetProp !== undefined;
	const cursorOffset = isControlled ? cursorOffsetProp : internalCursorOffset;

	useEffect(() => {
		if (isControlled || !focus || !showCursor) {
			return;
		}
		setInternalCursorOffset(prev => {
			const len = (originalValue || '').length;
			return prev > len - 1 ? len : prev;
		});
	}, [originalValue, focus, showCursor, isControlled]);

	const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
	const value = mask ? mask.repeat(originalValue.length) : originalValue;
	let renderedValue = value;
	let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

	if (showCursor && focus) {
		renderedPlaceholder =
			placeholder.length > 0
				? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
				: chalk.inverse(' ');

		renderedValue = value.length > 0 ? '' : chalk.inverse(' ');

		let i = 0;

		for (const char of value) {
			renderedValue +=
				i >= cursorOffset - cursorActualWidth && i <= cursorOffset
					? chalk.inverse(char)
					: char;

			i++;
		}

		if (value.length > 0 && cursorOffset === value.length) {
			renderedValue += chalk.inverse(' ');
		}
	}

	useInput(
		(input, key) => {
			if (
				key.upArrow ||
				key.downArrow ||
				(key.ctrl && input === 'c') ||
				key.tab ||
				(key.shift && key.tab)
			) {
				return;
			}

			if (key.return) {
				if (onSubmit) {
					onSubmit(originalValue);
				}

				return;
			}

			let nextCursorOffset = cursorOffset;
			let nextValue = originalValue;
			let nextCursorWidth = 0;

			if (key.ctrl) {
				// Readline keybinds
				switch (input) {
					case 'a': {
						// Move cursor to start of line
						nextCursorOffset = 0;
						break;
					}

					case 'e': {
						// Move cursor to end of line
						nextCursorOffset = originalValue.length;
						break;
					}

					case 'b': {
						// Move cursor back one character
						if (showCursor) {
							nextCursorOffset--;
						}

						break;
					}

					case 'f': {
						// Move cursor forward one character
						if (showCursor) {
							nextCursorOffset++;
						}

						break;
					}

					case 'w': {
						// Delete previous word (backward-kill-word)
						if (cursorOffset > 0) {
							let i = cursorOffset;

							// Skip whitespace immediately before cursor
							while (i > 0 && originalValue[i - 1] === ' ') {
								i--;
							}

							// Delete back to next whitespace or start
							while (i > 0 && originalValue[i - 1] !== ' ') {
								i--;
							}

							nextValue =
								originalValue.slice(0, i) + originalValue.slice(cursorOffset);
							nextCursorOffset = i;
						}

						break;
					}

					case 'u': {
						// Delete from cursor to start of line
						nextValue = originalValue.slice(cursorOffset);
						nextCursorOffset = 0;
						break;
					}

					case 'k': {
						// Delete from cursor to end of line
						nextValue = originalValue.slice(0, cursorOffset);
						break;
					}

					default:
						// Ignore all other ctrl combinations (don't insert characters)
						break;
				}
			} else if (key.leftArrow) {
				if (showCursor) {
					nextCursorOffset--;
				}
			} else if (key.rightArrow) {
				if (showCursor) {
					nextCursorOffset++;
				}
			} else if (key.backspace || key.delete) {
				if (cursorOffset > 0) {
					nextValue =
						originalValue.slice(0, cursorOffset - 1) +
						originalValue.slice(cursorOffset, originalValue.length);
					nextCursorOffset--;
				}
			} else {
				nextValue =
					originalValue.slice(0, cursorOffset) +
					input +
					originalValue.slice(cursorOffset, originalValue.length);
				nextCursorOffset += input.length;

				if (input.length > 1) {
					nextCursorWidth = input.length;
				}
			}

			if (nextCursorOffset < 0) {
				nextCursorOffset = 0;
			}

			if (nextCursorOffset > nextValue.length) {
				nextCursorOffset = nextValue.length;
			}

			setCursorWidth(nextCursorWidth);
			if (!isControlled) {
				setInternalCursorOffset(nextCursorOffset);
			}

			if (nextValue !== originalValue || nextCursorOffset !== cursorOffset) {
				onChange(nextValue, nextCursorOffset);
			}
		},
		{isActive: focus},
	);

	const finalValue = placeholder
		? value.length > 0
			? renderedValue
			: renderedPlaceholder
		: renderedValue;

	const displayValue =
		wrapWidth && wrapWidth > 0 && finalValue
			? wrapWithTrimmedContinuations(finalValue, wrapWidth)
			: finalValue;

	return <Text>{displayValue}</Text>;
}

export default TextInput;
