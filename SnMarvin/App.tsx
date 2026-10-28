/**
 * Send to Marvin — plugin view.
 * Shows the Tasks/Research choice for a selection, progress, and the result.
 * Plain black-on-white with no animation, for e-ink.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {choose, getState, reset, subscribe, type JobState} from './src/job';

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

function Body({state}: {state: JobState}) {
  switch (state.status) {
    case 'idle':
      return <Text style={styles.message}>Ready.</Text>;

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
              ? 'No tasks found'
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
  }
}

function App(): React.JSX.Element {
  const [state, setState] = useState<JobState>(getState());

  useEffect(() => {
    setState(getState());
    return subscribe(setState);
  }, []);

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Pressable style={styles.closeButton} onPress={close} hitSlop={16}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Body state={state} />
        {(state.status === 'done' || state.status === 'error') && (
          <View style={styles.row}>
            <Button label="Close" onPress={close} />
          </View>
        )}
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
    width: '80%',
    maxHeight: '70%',
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
  row: {flexDirection: 'row', justifyContent: 'center', marginTop: 16},
  button: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginHorizontal: 16,
  },
  buttonText: {fontSize: 32, fontWeight: '600', color: '#000000'},
});

export default App;
