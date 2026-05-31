import { describe, it, expect } from 'vitest';
import { parseMdDoc } from './parse.js';

const SAMPLE = `# [C000011] Common Table Cell

|サブシステム名|コンポーネントID|コンポーネント名称|
|:--|:--|:--|
|共通管理|C000011|共通テーブル候補者セル|

## コンポーネント機能概要
Displays information.

## ソースパス
\`features\\common\\components\\common-a\\common-table.component.ts\`

## 画面レイアウト

### 候補者名：ラベル
![C000011](./page/C000011_Common_Table_Cell.png)

### 候補者名：リンク
![C000011](./page/C000011_Common_Table_Cell2.png)
`;

describe('parseMdDoc', () => {
  it('extracts componentId from the metadata table column', () => {
    expect(parseMdDoc(SAMPLE, 'components/C000011.md').componentId).toBe('C000011');
  });
  it('extracts the source path and normalizes backslashes', () => {
    expect(parseMdDoc(SAMPLE, 'components/C000011.md').sourcePath)
      .toBe('features/common/components/common-a/common-table.component.ts');
  });
  it('extracts images with nearest heading as caption, resolved relative to the .md', () => {
    const imgs = parseMdDoc(SAMPLE, 'components/C000011.md').images;
    expect(imgs).toEqual([
      { caption: '候補者名：ラベル', path: 'components/page/C000011_Common_Table_Cell.png' },
      { caption: '候補者名：リンク', path: 'components/page/C000011_Common_Table_Cell2.png' },
    ]);
  });
  it('falls back to the title for componentId when no table', () => {
    expect(parseMdDoc('# [C999] Foo\n\nno table here', 'x.md').componentId).toBe('C999');
  });
  it('is tolerant of a doc with no source path / no images', () => {
    const d = parseMdDoc('# [C1] Bare', 'x.md');
    expect(d.sourcePath).toBeNull();
    expect(d.images).toEqual([]);
  });
  it('extracts the 機能概要 description', () => {
    expect(parseMdDoc(SAMPLE, 'components/C000011.md').description).toBe('Displays information.');
  });
  it('description is null when the section is absent', () => {
    expect(parseMdDoc('# [C1] Bare', 'x.md').description).toBeNull();
  });
});
