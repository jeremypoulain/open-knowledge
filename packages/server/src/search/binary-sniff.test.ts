import { describe, expect, test } from 'bun:test';
import { classifyByExtension, looksBinary } from './binary-sniff.ts';

describe('classifyByExtension', () => {
  test('documents route to extractors', () => {
    expect(classifyByExtension('notes/report.pdf')).toBe('document');
    expect(classifyByExtension('a/b/deck.PPTX')).toBe('document');
    expect(classifyByExtension('sheet.xlsx')).toBe('document');
    expect(classifyByExtension('memo.docx')).toBe('document');
  });

  test('text-ish files are candidate text', () => {
    expect(classifyByExtension('readme.md')).toBe('text');
    expect(classifyByExtension('data.json')).toBe('text');
    expect(classifyByExtension('notes.txt')).toBe('text');
    expect(classifyByExtension('src/index.ts')).toBe('text');
    expect(classifyByExtension('Makefile')).toBe('text');
  });

  test('binary and legacy OLE formats are skipped', () => {
    expect(classifyByExtension('logo.png')).toBe('skip');
    expect(classifyByExtension('archive.zip')).toBe('skip');
    expect(classifyByExtension('legacy.doc')).toBe('skip');
    expect(classifyByExtension('legacy.xls')).toBe('skip');
    expect(classifyByExtension('legacy.ppt')).toBe('skip');
  });
});

describe('looksBinary', () => {
  test('detects NUL bytes', () => {
    expect(looksBinary(Buffer.from([0x68, 0x69, 0x00, 0x21]))).toBe(true);
  });
  test('plain UTF-8 text is not binary', () => {
    expect(looksBinary(Buffer.from('hello world café', 'utf-8'))).toBe(false);
  });
});
