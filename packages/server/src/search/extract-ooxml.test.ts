import { describe, expect, test } from 'bun:test';
import yazl from 'yazl';
import { extractDocx, extractPptx, extractXlsx, unzipToMap } from './extract-ooxml.ts';

/** Build an in-memory ZIP from a name→content map (uses the production yazl dep). */
function zipBuffer(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const [name, content] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(content, 'utf-8'), name);
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

describe('extractPptx', () => {
  test('one segment per slide, in slide order, with slide locator', async () => {
    const buf = await zipBuffer({
      'ppt/slides/slide2.xml': '<p:sld><a:t>Second slide budget</a:t></p:sld>',
      'ppt/slides/slide1.xml': '<p:sld><a:t>Hello</a:t><a:t>World</a:t></p:sld>',
      'ppt/presentation.xml': '<p:presentation/>',
    });
    const segments = extractPptx(await unzipToMap(buf));
    expect(segments).toEqual([
      { text: 'Hello World', locator: { kind: 'slide', slide: 1 } },
      { text: 'Second slide budget', locator: { kind: 'slide', slide: 2 } },
    ]);
  });
});

describe('extractDocx', () => {
  test('whole document as a single segment, decoded', async () => {
    const buf = await zipBuffer({
      'word/document.xml':
        '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve">R&amp;D notes</w:t></w:r></w:p></w:body></w:document>',
    });
    const segments = extractDocx(await unzipToMap(buf));
    expect(segments).toEqual([{ text: 'Hello R&D notes' }]);
  });
});

describe('extractXlsx', () => {
  test('one segment per sheet, resolving shared strings and numeric cells', async () => {
    const buf = await zipBuffer({
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Quarterly</t></si><si><t>Revenue</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>42</v></c></row></sheetData></worksheet>',
    });
    const segments = extractXlsx(await unzipToMap(buf));
    expect(segments).toEqual([
      { text: 'Quarterly Revenue 42', locator: { kind: 'sheet', sheet: 'Budget' } },
    ]);
  });
});
