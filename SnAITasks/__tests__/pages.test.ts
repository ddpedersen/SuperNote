import {chunk, estimateUsage, parsePageList} from '../src/pages';
import {extractTasks} from '../src/claude';

describe('parsePageList', () => {
  it('parses ranges and singles into sorted unique 0-based pages', () => {
    expect(parsePageList('3, 1-2 2', 10)).toEqual([0, 1, 2]);
    expect(parsePageList('8-10', 10)).toEqual([7, 8, 9]);
  });
  it('rejects bad input with a readable message', () => {
    expect(() => parsePageList('', 5)).toThrow(/Enter pages/);
    expect(() => parsePageList('a-b', 5)).toThrow(/isn't a page/);
    expect(() => parsePageList('4-9', 5)).toThrow(/outside pages 1-5/);
    expect(() => parsePageList('3-1', 5)).toThrow(/outside/);
  });
});

describe('chunk / estimate', () => {
  it('splits into batches', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
  });
  it('estimates time and cost for known models', () => {
    expect(estimateUsage(30, 'claude-opus-5-5')).toMatch(/About 2 minutes.*\$0\.33/);
    expect(estimateUsage(12, 'claude-haiku-5-5')).toMatch(/under \$0\.01/);
    expect(estimateUsage(12, 'other-model')).toMatch(/billed to your Anthropic account/);
  });
});

describe('multi-page request', () => {
  it('labels each page image', async () => {
    let body: any;
    (globalThis as any).fetch = jest.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          stop_reason: 'end_turn',
          content: [{type: 'text', text: '{"tasks":[]}'}],
        }),
      };
    });
    await extractTasks(
      'k',
      'm',
      {kind: 'pages', images: [{page: 0, base64: 'A'}, {page: 4, base64: 'B'}]},
      'marked',
    );
    const content = body.messages[0].content;
    expect(content.map((c: any) => c.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(content[2].text).toBe('Page 5:');
    expect(content[4].text).toMatch(/diagonal-line/);
  });
});
