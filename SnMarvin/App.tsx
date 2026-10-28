/**
 * Send to Marvin — plugin view.
 * Shows the note menu (page / whole note / pages / marked headings), the
 * Tasks/Research choice for a selection, progress, the result, and Settings.
 * Plain black-on-white with no animation, for e-ink.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {
  choose,
  confirmSend,
  getState,
  openPagePicker,
  openSettings,
  reset,
  sendCurrentPage,
  sendMarked,
  sendPageList,
  sendWholeNote,
  settingsSaved,
  startNote,
  subscribe,
  type JobState,
} from './src/job';
import {getLog} from './src/log';
import SettingsScreen from './src/SettingsScreen';

function close() {
  reset();
  PluginManager.closePluginView();
}

function Button({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** Diagnostic log, sized to stay readable in a phone photo of the screen. */
function Details() {
  return (
    <ScrollView style={styles.details}>
      {getLog().map((line, i) => (
        <Text key={i} style={styles.detailsLine}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

/** Full-width menu option with a one-line explanation. */
function Option({label, hint, onPress}: {label: string; hint: string; onPress: () => void}) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
      <Text style={styles.optionHint}>{hint}</Text>
    </Pressable>
  );
}

function PagePicker({totalPages, error}: {totalPages: number; error?: string}) {
  const [text, setText] = useState('');
  return (
    <>
      <Text style={styles.title}>Which pages?</Text>
      <Text style={styles.message}>This note has {totalPages} pages. Example: 1-3, 5, 8-10</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        autoFocus
        autoCorrect={false}
        onSubmitEditing={() => sendPageList(text)}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        <Button label="Send" onPress={() => sendPageList(text)} />
        <Button label="Back" onPress={startNote} />
      </View>
    </>
  );
}

function Body({state}: {state: JobState}) {
  switch (state.status) {
    case 'idle':
      return <Text style={styles.message}>Ready.</Text>;

    case 'menu': {
      const {currentPage, totalPages} = state.note;
      return (
        <ScrollView>
          <Text style={styles.title}>Send to Marvin</Text>
          <Option
            label="This page"
            hint={`Page ${currentPage + 1} of ${totalPages}: every to-do on it`}
            onPress={sendCurrentPage}
          />
          <Option
            label="Whole note"
            hint={`All ${totalPages} page${totalPages === 1 ? '' : 's'}: every to-do in the note`}
            onPress={sendWholeNote}
          />
          <Option label="Choose pages…" hint="Pick pages, e.g. 1-3, 5" onPress={openPagePicker} />
          <Option
            label="Marked headings"
            hint="Only items set as a heading with the diagonal-line style, from the whole note"
            onPress={sendMarked}
          />
        </ScrollView>
      );
    }

    case 'pickPages':
      return <PagePicker totalPages={state.note.totalPages} error={state.error} />;

    case 'confirm':
      return (
        <>
          <Text style={styles.title}>Send {state.pageCount} pages?</Text>
          <Text style={styles.message}>{state.estimate}</Text>
          <Text style={styles.hint}>
            Pages are sent 5 at a time. Tasks found so far are kept if something fails partway.
          </Text>
          <View style={styles.row}>
            <Button label="Send" onPress={confirmSend} />
            <Button label="Back" onPress={startNote} />
          </View>
        </>
      );

    case 'choose':
      return (
        <>
          <Text style={styles.title}>Send selection to Marvin as…</Text>
          <View style={styles.row}>
            <Button label="Tasks" onPress={() => choose('tasks')} />
            <Button label="Research" onPress={() => choose('research')} />
          </View>
        </>
      );

    case 'working':
      return <Text style={styles.message}>{state.message}</Text>;

    case 'done': {
      const n = state.added.length;
      return (
        <>
          <Text style={styles.title}>
            {n === 0 && state.failed === 0
              ? state.emptyMessage ?? 'No tasks found'
              : `✓ ${n} task${n === 1 ? '' : 's'} added to Marvin`}
          </Text>
          <ScrollView style={styles.list}>
            {state.added.map((t, i) => (
              <Text key={i} style={styles.item}>
                • {t}
              </Text>
            ))}
          </ScrollView>
          {state.failed > 0 && (
            <Text style={styles.error}>
              {state.failed} failed: {state.failReason}
            </Text>
          )}
        </>
      );
    }

    case 'error':
      return (
        <>
          <Text style={styles.title}>Not sent</Text>
          <Text style={styles.error}>{state.message}</Text>
        </>
      );

    case 'saved':
      return state.deferred ? (
        <>
          <Text style={styles.title}>✓ Keys valid</Text>
          <Text style={styles.message}>
            One more step: go to a note and use the plugin once to save the keys before restarting
            your device.
          </Text>
          <Text style={styles.hint}>
            Any plugin button works. For example, lasso something, tap To Marvin, then ✕. Nothing is
            sent until you choose Tasks or Research. Until then, the keys are only kept in memory.
          </Text>
        </>
      ) : (
        <Text style={styles.title}>✓ Settings saved</Text>
      );

    case 'setup':
      return null; // rendered by App
  }
}

function App(): React.JSX.Element {
  const [state, setState] = useState<JobState>(getState());
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setState(getState());
    return subscribe(s => {
      setState(s);
      if (s.status === 'choose' || s.status === 'done' || s.status === 'error') {
        setShowDetails(false);
      }
    });
  }, []);

  const finished =
    state.status === 'done' ||
    state.status === 'error' ||
    state.status === 'saved' ||
    state.status === 'idle' ||
    state.status === 'menu';

  if (state.status === 'setup') {
    return (
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <SettingsScreen
            resuming={!!state.pending}
            fromGear={!!state.fromGear}
            onSaved={settingsSaved}
            onCancel={reset}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Pressable style={styles.closeButton} onPress={close} hitSlop={16}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {showDetails ? <Details /> : <Body state={state} />}
        <View style={styles.row}>
          <Button
            label={showDetails ? 'Hide details' : 'Show details'}
            onPress={() => setShowDetails(!showDetails)}
          />
          {finished && <Button label="Settings" onPress={() => openSettings()} />}
          {finished && <Button label="Close" onPress={close} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  card: {
    width: '90%',
    maxHeight: '90%',
    padding: 40,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    padding: 8,
    zIndex: 1,
  },
  closeText: {fontSize: 32, color: '#000000'},
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 24,
    marginRight: 40,
  },
  message: {fontSize: 32, color: '#000000', marginRight: 40},
  list: {marginBottom: 16},
  item: {fontSize: 28, color: '#000000', marginBottom: 12},
  error: {fontSize: 28, color: '#000000', marginBottom: 16},
  hint: {fontSize: 24, color: '#000000', marginTop: 16},
  option: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  optionHint: {fontSize: 22, color: '#000000', marginTop: 4},
  input: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    fontSize: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
    marginBottom: 8,
    color: '#000000',
  },
  details: {marginTop: 40, marginBottom: 8},
  detailsLine: {
    fontSize: 22,
    lineHeight: 30,
    color: '#000000',
    fontFamily: 'monospace',
  },
  row: {flexDirection: 'row', justifyContent: 'center', marginTop: 16},
  button: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 18,
    paddingHorizontal: 36,
    marginHorizontal: 12,
  },
  buttonText: {fontSize: 32, fontWeight: '600', color: '#000000'},
});

export default App;
