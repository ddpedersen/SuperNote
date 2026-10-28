/** Marked-heading detection and on-device recognition, with a mocked SDK. */
jest.mock('sn-plugin-lib', () => ({
  FileUtils: {},
  PluginManager: {},
  PluginNoteAPI: {},
  PluginCommAPI: {
    recycleElement: jest.fn(),
    recognizeElements: jest.fn(async (strokes: any[]) => ({
      success: true,
      result: strokes.map(s => `word${s.numInPage}`).join(' '),
    })),
  },
  PluginFileAPI: {
    getTitles: jest.fn(async () => ({
      success: true,
      result: [
        {page: 0, style: 4, controlTrailNums: [1, 2]}, // marked
        {page: 0, style: 1, controlTrailNums: [3]}, // black heading: ignored
        {page: 2, style: 4, controlTrailNums: [9]}, // marked, strokes missing
      ],
    })),
    getPageSize: jest.fn(async () => ({success: true, result: {width: 1920, height: 2560}})),
    getElements: jest.fn(async (page: number) => ({
      success: true,
      result:
        page === 0
          ? [
              {uuid: 'a', type: 0, numInPage: 1},
              {uuid: 'b', type: 0, numInPage: 2},
              {uuid: 'c', type: 0, numInPage: 3},
              {uuid: 't', type: 100, numInPage: 4},
            ]
          : [],
    })),
  },
}));

import {PluginCommAPI} from 'sn-plugin-lib';
import {getMarkedHeadings} from '../src/capture';

it('recognizes only diagonal-line headings and falls back to images when needed', async () => {
  const result = await getMarkedHeadings('/note.note', 3);
  expect(result.items).toEqual([{page: 0, text: 'word1 word2'}]);
  expect(result.unrecognizedPages).toEqual([2]);
  // only the marked heading's strokes go to recognition
  const strokes = (PluginCommAPI.recognizeElements as jest.Mock).mock.calls[0][0];
  expect(strokes.map((s: any) => s.numInPage)).toEqual([1, 2]);
  // every fetched element is released
  expect(PluginCommAPI.recycleElement).toHaveBeenCalledTimes(4);
});
