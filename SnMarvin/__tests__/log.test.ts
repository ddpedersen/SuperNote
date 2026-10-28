import {clearLog, getLog, log, mask} from '../src/log';
import {extractTasks} from '../src/claude';

describe('diagnostic log', () => {
  it('masks secrets', () => {
    const key = 'sk-ant-api03-SECRETSECRETSECRET-abc';
    const m = mask(key);
    expect(m).not.toContain('SECRET');
    expect(m).toContain(`${key.length} chars`);
    expect(mask('')).toBe('(empty)');
  });

  it('records the API exchange without the key', async () => {
    clearLog();
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({error: {type: 'invalid_request_error', message: 'bad field'}}),
    }));
    await expect(
      extractTasks('sk-ant-TOPSECRET', 'claude-opus-5-5', {kind: 'text', text: 'x'}, 'tasks'),
    ).rejects.toThrow(/400/);
    const text = getLog().join('\n');
    expect(text).toMatch(/^SnMarvin v\d/);
    expect(text).toContain('HTTP 400');
    expect(text).toContain('bad field');
    expect(text).not.toContain('TOPSECRET');
  });

  it('keeps only the most recent lines', () => {
    clearLog();
    for (let i = 0; i < 100; i++) {
      log(`line ${i}`);
    }
    const lines = getLog();
    expect(lines.length).toBe(61); // version header + 60
    expect(lines[lines.length - 1]).toContain('line 99');
  });
});
