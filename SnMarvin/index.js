/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {PluginManager, PluginDocAPI} from 'sn-plugin-lib';
import {startPage, startLasso, startText} from './src/job';

const BUTTON_PAGE = 100;
const BUTTON_LASSO = 200;
const BUTTON_DOC_TEXT = 300;

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

console.log('[SnMarvin] plugin loaded');

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

PluginManager.registerButton(1, ['NOTE'], {
  id: BUTTON_PAGE,
  name: 'Page → Marvin',
  icon,
  showType: 1,
});

PluginManager.registerButton(2, ['NOTE'], {
  id: BUTTON_LASSO,
  name: 'To Marvin',
  icon,
  editDataTypes: [0, 1, 3], // strokes, titles, text boxes
  showType: 1,
});

PluginManager.registerButton(3, ['DOC'], {
  id: BUTTON_DOC_TEXT,
  name: 'To Marvin',
  icon,
  showType: 1,
});

// Registered here rather than in App so the lasso is captured immediately,
// before the plugin view mounts.
PluginManager.registerButtonListener({
  onButtonPress: async event => {
    console.log('[SnMarvin] button', event.id);
    switch (event.id) {
      case BUTTON_PAGE:
        startPage();
        break;
      case BUTTON_LASSO:
        startLasso();
        break;
      case BUTTON_DOC_TEXT: {
        const res = await PluginDocAPI.getLastSelectedText();
        startText(res?.success ? res.result ?? '' : '');
        break;
      }
    }
  },
});
